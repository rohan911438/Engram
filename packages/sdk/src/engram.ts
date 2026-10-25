import { join, resolve } from "node:path";
import { canonical, decrypt, encrypt, generateKeyPair, hexToBytes, newDataKey, publicKeyOf, randomId, sha256Hex, sign } from "./crypto.js";
import { LocalStore } from "./store.js";
import { KeyVault } from "./vault.js";
import type { RemoteMemory } from "./remote.js";
import type { LLM } from "./llm.js";
import { proposeOps, type BeliefOp } from "./consolidator.js";
import type { Anchorer } from "./anchor.js";
import { buildCommitTree, commitId, proofFor, verifyBeliefProof, verifyManifestSignature } from "./proof.js";
import { verifySignature } from "./crypto.js";
import type { Belief, Commit, CommitManifest, Envelope, Episode, EpisodeContent, EpisodeSource, Receipt } from "./types.js";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  /** Skipped checks (e.g. no network) don't fail the report but are shown. */
  skipped?: boolean;
}

export interface VerifyReport {
  ok: boolean;
  checks: Check[];
}

export interface VerifyOptions {
  /** Also confirm the manifest on Walrus Memory (network). Default true. */
  walrus?: boolean;
  /** Also confirm the anchor on Sui via the anchorer (network). Default true. */
  chain?: boolean;
}

export interface DecideInput {
  action: string;
  /** What the agent was asked / saw. Only its hash is stored. */
  input: unknown;
  /** Beliefs the decision relied on: "b_x" (version in HEAD) or "b_x@2". */
  beliefs: string[];
}

export interface ForgetResult {
  episode: Episode;
  revised: Belief[];
  retracted: Belief[];
}

export class NothingToCommitError extends Error {
  constructor(first = false) {
    super(first ? "nothing to commit — no beliefs yet (observe episodes, then run sleep)" : "nothing to commit — beliefs are unchanged since the last commit");
  }
}

export interface BeliefDiff {
  added: Belief[];
  /** [before, after] */
  changed: [Belief, Belief][];
  removed: Belief[];
}

export interface BisectResult {
  /** First commit where the agent behaves badly. */
  commit: Commit;
  /** What that commit changed — the likely culprit. */
  diff: BeliefDiff;
  steps: { commit: string; bad: boolean }[];
  tested: number;
  candidates: number;
}

export interface BlameEntry {
  episode: Episode;
  /** Decrypted content, or null if forgotten. */
  content: EpisodeContent | null;
}

/** "b_rent@2" */
export const beliefKey = (b: Pick<Belief, "id" | "version">) => `${b.id}@${b.version}`;

export interface SleepOptions {
  llm: LLM;
  /** Domain hint for the consolidator. */
  context?: string;
  /** Episodes per LLM call. Default 40. */
  batchSize?: number;
}

export interface SleepReport {
  episodes: number;
  created: Belief[];
  revised: Belief[];
  retracted: Belief[];
  rejected: { op: unknown; why: string }[];
}

export interface EngramConfig {
  v: 1;
  agent: string;
  agentPubKey: string;
  createdAt: number;
  namespaces: { episodes: string; beliefs: string; commits: string; receipts: string };
}

export interface OpenOptions {
  /** Folder that contains (or will contain) `.engram/`. Default: cwd. */
  dir?: string;
  remote: RemoteMemory;
  /** Finds the on-chain anchor for commits. Without one, commits are signed but unanchored. */
  anchorer?: Anchorer;
  /**
   * Open without the agent's keys (e.g. a repo rebuilt from an audit bundle):
   * history, beliefs, receipts and verification work; signing and decrypting don't.
   */
  readOnly?: boolean;
}

export interface ObserveInput {
  source: EpisodeSource;
  data: unknown;
  /** Short label shown in logs. Stored in the clear locally — keep it non-sensitive. */
  summary?: string;
  ts?: number;
}

export interface PushResult {
  episodes: number;
  beliefs: number;
  receipts: number;
}

export class Engram {
  readonly store: LocalStore;
  readonly vault: KeyVault;
  readonly config: EngramConfig;
  readonly remote: RemoteMemory;
  readonly anchorer?: Anchorer;
  private secretKey: string;
  /** True when opened without keys — nothing can be signed or decrypted. */
  readonly readOnly: boolean;

  private constructor(store: LocalStore, remote: RemoteMemory, anchorer?: Anchorer, readOnly = false) {
    this.store = store;
    this.remote = remote;
    this.anchorer = anchorer;
    const config = store.file<EngramConfig>("config.json").read();
    if (!config) throw new Error(`No Engram repo at ${store.root}. Run \`engram init\` first.`);
    this.config = config;
    const sk = store.readText("agent.key");
    const mk = store.readText("master.key");
    this.readOnly = readOnly;
    if (readOnly) {
      this.secretKey = "";
      // A vault with a throwaway master key and no entries: every read() returns null.
      this.vault = new KeyVault(store.file("vault.json"), newDataKey());
      return;
    }
    if (!sk || !mk) throw new Error("Missing agent.key or master.key in .engram/");
    if (publicKeyOf(sk) !== config.agentPubKey) throw new Error("agent.key does not match config.json");
    this.secretKey = sk;
    this.vault = new KeyVault(store.file("vault.json"), hexToBytes(mk));
  }

  /** Creates `.engram/` with a fresh agent signing key and master key. */
  static init(agent: string, opts: OpenOptions): Engram {
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(agent)) {
      throw new Error("agent name: lowercase letters, digits and dashes only");
    }
    const store = new LocalStore(join(resolve(opts.dir ?? "."), ".engram"));
    if (store.exists()) throw new Error(`Engram repo already exists at ${store.root}`);
    const kp = generateKeyPair();
    store.writeText("agent.key", kp.secretKey);
    store.writeText("master.key", newDataKey().toString("hex"));
    const ns = (k: string) => `engram-${agent}-${k}`;
    store.file<EngramConfig>("config.json").write({
      v: 1,
      agent,
      agentPubKey: kp.publicKey,
      createdAt: Date.now(),
      namespaces: { episodes: ns("episodes"), beliefs: ns("beliefs"), commits: ns("commits"), receipts: ns("receipts") },
    });
    return new Engram(store, opts.remote, opts.anchorer);
  }

  static open(opts: OpenOptions): Engram {
    return new Engram(new LocalStore(join(resolve(opts.dir ?? "."), ".engram")), opts.remote, opts.anchorer, opts.readOnly);
  }

  get agent(): string {
    return this.config.agent;
  }

  get publicKey(): string {
    return this.config.agentPubKey;
  }

  /** Signs with the agent key (commits and receipts). */
  protected signRaw(message: string): string {
    if (this.readOnly) throw new Error("this repo is read-only (opened without the agent's key)");
    return sign(message, this.secretKey);
  }

  // ---- Episodes ------------------------------------------------------------

  /** Records a raw event, encrypted with its own key. Stored locally; `push()` uploads it. */
  observe(input: ObserveInput): Episode {
    const id = randomId("ep");
    const ts = input.ts ?? Date.now();
    const content: EpisodeContent = { source: input.source, ts, data: input.data };
    const plaintext = canonical(content);
    const { keyId, key } = this.vault.create();
    const sealed = encrypt(Buffer.from(plaintext, "utf8"), key, id);
    const envelope: Envelope = { engram: "episode", v: 1, id, keyId, ...sealed };
    const episode: Episode = {
      id,
      ts,
      source: input.source,
      summary: input.summary,
      contentHash: sha256Hex(plaintext),
      keyId,
      envelope,
    };
    this.store.put("episodes", id, episode);
    return episode;
  }

  episodes(): Episode[] {
    return this.store.list<Episode>("episodes").sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
  }

  episode(id: string): Episode | null {
    return this.store.get<Episode>("episodes", id);
  }

  /** Decrypts an episode. Returns null if it was forgotten. Throws if it was tampered with. */
  read(id: string): EpisodeContent | null {
    const ep = this.episode(id);
    if (!ep) throw new Error(`unknown episode ${id}`);
    const key = this.vault.get(ep.keyId);
    if (!key) return null;
    const plaintext = decrypt(ep.envelope, key, ep.id).toString("utf8");
    if (sha256Hex(plaintext) !== ep.contentHash) throw new Error(`episode ${id} content hash mismatch`);
    return JSON.parse(plaintext) as EpisodeContent;
  }

  // ---- Beliefs ---------------------------------------------------------------

  /** Every version of every belief, oldest first. */
  beliefVersions(): Belief[] {
    return this.store.list<Belief>("beliefs").sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id) || a.version - b.version);
  }

  /** Latest version of each belief, including retracted ones. */
  latestBeliefs(): Belief[] {
    const latest = new Map<string, Belief>();
    for (const b of this.beliefVersions()) {
      const cur = latest.get(b.id);
      if (!cur || b.version > cur.version) latest.set(b.id, b);
    }
    return [...latest.values()];
  }

  /** The beliefs that currently guide the agent. */
  beliefs(): Belief[] {
    return this.latestBeliefs().filter((b) => b.status === "active");
  }

  /** A belief by "b_x" (latest) or "b_x@2" (exact version). */
  belief(ref: string): Belief | null {
    const [id, v] = ref.split("@");
    if (v) return this.store.get<Belief>("beliefs", ref);
    return this.latestBeliefs().find((b) => b.id === id) ?? null;
  }

  /** All versions of one belief, oldest first. */
  history(id: string): Belief[] {
    return this.beliefVersions().filter((b) => b.id === id).sort((a, b) => a.version - b.version);
  }

  /** Episodes that `sleep()` has not processed yet (forgotten ones are skipped). */
  pendingEpisodes(): Episode[] {
    return this.episodes().filter((e) => !e.consolidatedAt && !e.forgottenAt);
  }

  /**
   * Consolidation: new episodes + current beliefs → belief changes, via the LLM.
   * Every change is a new immutable belief version with evidence and a reason.
   */
  async sleep(opts: SleepOptions): Promise<SleepReport> {
    const report: SleepReport = { episodes: 0, created: [], revised: [], retracted: [], rejected: [] };
    const pending = this.pendingEpisodes();
    const size = opts.batchSize ?? 40;
    for (let i = 0; i < pending.length; i += size) {
      const batch = pending.slice(i, i + size);
      const episodes = batch.flatMap((e) => {
        const content = this.read(e.id);
        return content ? [{ id: e.id, content, summary: e.summary }] : [];
      });
      const { ops, rejected } = await proposeOps(opts.llm, { episodes, beliefs: this.beliefs(), context: opts.context });
      report.rejected.push(...rejected);
      for (const op of ops) {
        const b = this.applyOp(op);
        if (op.op === "create") report.created.push(b);
        else if (op.op === "revise") report.revised.push(b);
        else report.retracted.push(b);
      }
      const now = Date.now();
      for (const e of batch) this.store.put("episodes", e.id, { ...e, consolidatedAt: now });
      report.episodes += batch.length;
    }
    return report;
  }

  /** Applies one belief change. Exposed so users (and tests) can edit beliefs by hand. */
  applyOp(op: BeliefOp): Belief {
    const now = Date.now();
    if (op.op === "create") {
      const taken = new Set(this.latestBeliefs().map((b) => b.id));
      let id = `b_${op.key}`;
      for (let n = 2; taken.has(id); n++) id = `b_${op.key}_${n}`;
      const b: Belief = { id, version: 1, statement: op.statement, confidence: op.confidence, evidence: [...op.evidence].sort(), tags: op.tags, status: "active", createdAt: now, reason: op.reason };
      this.store.put("beliefs", beliefKey(b), b);
      return b;
    }
    const prev = this.belief(op.belief);
    if (!prev) throw new Error(`unknown belief ${op.belief}`);
    const next: Belief =
      op.op === "revise"
        ? { id: prev.id, version: prev.version + 1, statement: op.statement, confidence: op.confidence, evidence: [...op.evidence].sort(), tags: op.tags?.length ? op.tags : prev.tags, supersedes: beliefKey(prev), status: "active", createdAt: now, reason: op.reason }
        : { ...prev, version: prev.version + 1, supersedes: beliefKey(prev), status: "retracted", createdAt: now, reason: op.reason, blobId: undefined };
    this.store.put("beliefs", beliefKey(next), next);
    return next;
  }

  /**
   * Beliefs relevant to a task. Uses Walrus Memory semantic recall over pushed
   * beliefs, then falls back to keyword matching for anything not pushed yet.
   */
  async relevant(query: string, limit = 5): Promise<Belief[]> {
    const active = new Map(this.beliefs().map((b) => [beliefKey(b), b]));
    const out: Belief[] = [];
    try {
      const hits = await this.remote.search(this.config.namespaces.beliefs, query, limit * 3);
      for (const h of hits) {
        const key = parseBeliefText(h.text);
        const b = key ? active.get(key) : undefined;
        if (b && !out.includes(b)) out.push(b);
      }
    } catch {
      // remote unavailable — keyword fallback below
    }
    if (out.length < limit) {
      const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
      const scored = [...active.values()]
        .filter((b) => !out.includes(b))
        .map((b) => ({ b, s: words.filter((w) => `${b.statement} ${b.tags.join(" ")}`.toLowerCase().includes(w)).length }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || b.b.confidence - a.b.confidence);
      out.push(...scored.map((x) => x.b));
    }
    return out.slice(0, limit);
  }

  // ---- Commits ---------------------------------------------------------------

  /** Current commit ID, or null before the first commit. */
  head(): string | null {
    return this.store.readText("HEAD") || null;
  }

  getCommit(id: string): Commit | null {
    return this.store.get<Commit>("commits", id);
  }

  /** IDs of forgotten episodes, sorted. */
  tombstones(): string[] {
    return this.episodes().filter((e) => e.forgottenAt).map((e) => e.id).sort();
  }

  /**
   * Snapshot of the current beliefs: push pending data, build the Merkle root,
   * sign the manifest, store it on Walrus Memory and look up its Sui anchor.
   */
  async commit(message: string, opts: { allowEmpty?: boolean } = {}): Promise<Commit> {
    const parent = this.head();
    const beliefs = this.beliefs().sort((a, b) => beliefKey(a).localeCompare(beliefKey(b)));
    const tombstones = this.tombstones();
    const { tree } = buildCommitTree(beliefs, tombstones);
    const parentCommit = parent ? this.getCommit(parent) : null;
    if (!opts.allowEmpty && parentCommit && parentCommit.manifest.merkleRoot === tree.root) throw new NothingToCommitError();
    if (!opts.allowEmpty && !parentCommit && beliefs.length === 0 && tombstones.length === 0) throw new NothingToCommitError(true);

    await this.push();
    const pushedBeliefs = beliefs.map((b) => this.belief(beliefKey(b))!);
    const episodes: Record<string, string> = {};
    for (const b of pushedBeliefs) {
      for (const id of b.evidence) {
        const ep = this.episode(id);
        if (ep?.blobId) episodes[id] = ep.blobId;
      }
    }
    const manifest: CommitManifest = {
      engram: "commit",
      v: 1,
      agent: this.agent,
      parent,
      ts: Date.now(),
      message,
      merkleRoot: tree.root,
      beliefs: pushedBeliefs.map(beliefKey),
      tombstones,
      episodes,
      beliefBlobs: Object.fromEntries(pushedBeliefs.map((b) => [beliefKey(b), b.blobId ?? ""])),
      agentPubKey: this.publicKey,
    };
    const id = commitId(manifest);
    const signature = this.signRaw(canonical(manifest));
    const [manifestBlobId] = await this.remote.putMany([{ namespace: this.config.namespaces.commits, text: commitText(id, manifest, signature) }]);
    const commit: Commit = { id, manifest, signature, manifestBlobId };
    this.store.put("commits", id, commit);
    this.store.writeText("HEAD", id);
    return this.anchor(id);
  }

  /** Looks up (or retries looking up) the Sui anchor of a commit. */
  async anchor(id: string): Promise<Commit> {
    const c = this.getCommit(id);
    if (!c) throw new Error(`unknown commit ${id}`);
    if (c.anchor || !this.anchorer || !c.manifestBlobId) return c;
    const anchor = this.anchorer.publish ? await this.anchorer.publish(c) : await this.anchorer.find(c.manifestBlobId);
    if (!anchor) return c;
    const next = { ...c, anchor };
    this.store.put("commits", id, next);
    return next;
  }

  /** Commits from HEAD back to the first one. */
  log(from?: string): Commit[] {
    const out: Commit[] = [];
    let id: string | null = from ? this.resolve(from) : this.head();
    while (id) {
      const c = this.getCommit(id);
      if (!c) throw new Error(`broken history: missing commit ${id}`);
      out.push(c);
      id = c.manifest.parent;
    }
    return out;
  }

  /**
   * Resolves "HEAD", "HEAD~2", a full or short (≥4 chars) commit ID, or a
   * date ("2026-10-25") → the last commit made at or before it.
   */
  resolve(ref: string): string {
    const all = this.log();
    if (all.length === 0) throw new Error("no commits yet");
    const m = /^HEAD(?:~(\d+))?$/.exec(ref);
    if (m) {
      const c = all[Number(m[1] ?? 0)];
      if (!c) throw new Error(`${ref} is beyond the first commit`);
      return c.id;
    }
    if (/^[0-9a-f]{4,64}$/.test(ref)) {
      const hits = all.filter((c) => c.id.startsWith(ref));
      if (hits.length === 1) return hits[0]!.id;
      if (hits.length > 1) throw new Error(`ambiguous commit ${ref}`);
    }
    const t = Date.parse(ref.length === 10 ? `${ref}T23:59:59.999Z` : ref);
    if (!Number.isNaN(t)) {
      const c = all.find((x) => x.manifest.ts <= t);
      if (!c) throw new Error(`no commit at or before ${ref}`);
      return c.id;
    }
    throw new Error(`unknown commit ${ref}`);
  }

  /** The beliefs the agent had at a commit — time travel. */
  beliefsAt(ref: string): Belief[] {
    const c = this.getCommit(this.resolve(ref))!;
    return c.manifest.beliefs.map((k) => {
      const b = this.belief(k);
      if (!b) throw new Error(`commit ${c.id.slice(0, 8)} references missing belief ${k}`);
      return b;
    });
  }

  /** What changed between two commits (or a commit and the working beliefs when `to` is omitted). */
  diff(from: string, to?: string): BeliefDiff {
    const a = new Map(this.beliefsAt(from).map((b) => [b.id, b]));
    const b = new Map((to ? this.beliefsAt(to) : this.beliefs()).map((x) => [x.id, x]));
    const out: BeliefDiff = { added: [], changed: [], removed: [] };
    for (const [id, nb] of b) {
      const ob = a.get(id);
      if (!ob) out.added.push(nb);
      else if (ob.version !== nb.version) out.changed.push([ob, nb]);
    }
    for (const [id, ob] of a) if (!b.has(id)) out.removed.push(ob);
    return out;
  }

  /**
   * Binary search over history: given a commit where the agent behaved well
   * and a later one where it didn't, finds the first bad commit. `isBad`
   * receives the beliefs at a commit (time travel) — run the agent's test there.
   */
  async bisect(opts: { good: string; bad: string; isBad: (beliefs: Belief[], commit: Commit) => Promise<boolean> | boolean }): Promise<BisectResult> {
    const good = this.resolve(opts.good);
    const bad = this.resolve(opts.bad);
    // Commits from good (exclusive) to bad (inclusive), oldest first.
    const chain = this.log(bad).map((c) => c.id);
    const gi = chain.indexOf(good);
    if (gi < 0) throw new Error("the good commit must be an ancestor of the bad commit");
    const range = chain.slice(0, gi).reverse();
    if (range.length === 0) throw new Error("good and bad are the same commit");
    const steps: { commit: string; bad: boolean }[] = [];
    let lo = 0;
    let hi = range.length - 1; // range[hi] is known bad
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const id = range[mid]!;
      const isBad = await opts.isBad(this.beliefsAt(id), this.getCommit(id)!);
      steps.push({ commit: id, bad: isBad });
      if (isBad) hi = mid;
      else lo = mid + 1;
    }
    const first = this.getCommit(range[lo]!)!;
    const parent = first.manifest.parent;
    return { commit: first, steps, tested: steps.length, candidates: range.length, diff: parent ? this.diff(parent, first.id) : { added: this.beliefsAt(first.id), changed: [], removed: [] } };
  }

  /** The episodes behind a belief version, decrypted where possible. */
  blame(ref: string): { belief: Belief; history: Belief[]; evidence: BlameEntry[] } {
    const belief = this.belief(ref);
    if (!belief) throw new Error(`unknown belief ${ref}`);
    const evidence = belief.evidence.map((id) => {
      const stored = this.episode(id);
      const episode = stored ?? (this.readOnly ? this.sharedEpisodeStub(id, belief.createdAt) : null);
      if (!episode) throw new Error(`belief ${ref} cites missing episode ${id}`);
      return { episode, content: !stored || episode.forgottenAt ? null : this.read(id) };
    }).sort((a, b) => a.episode.ts - b.episode.ts);
    return { belief, history: this.history(belief.id).filter((b) => b.version <= belief.version), evidence };
  }

  /**
   * In a read-only repo rebuilt from an audit bundle the raw episodes aren't
   * present (they stay with the agent). Commits still record each evidence
   * episode's Walrus blob ID, so blame can point at it.
   */
  private sharedEpisodeStub(id: string, ts: number): Episode {
    const blobId = this.head() ? this.log().map((c) => c.manifest.episodes[id]).find(Boolean) : undefined;
    return { id, ts, source: "agent", summary: "kept private by the agent", blobId, keyId: "", contentHash: "", envelope: { iv: "", ct: "", tag: "" } } as unknown as Episode;
  }

  // ---- Receipts --------------------------------------------------------------

  /**
   * Records a signed receipt for a decision: which committed beliefs it used,
   * with Merkle proofs that they were in the HEAD commit.
   */
  decide(input: DecideInput): Receipt {
    const head = this.head();
    if (!head) throw new Error("commit before making decisions — receipts point at a commit");
    const commit = this.getCommit(head)!;
    const atHead = new Map(this.beliefsAt(head).map((b) => [b.id, b]));
    const used = input.beliefs.map((ref) => {
      const b = ref.includes("@") ? this.belief(ref) : atHead.get(ref);
      if (!b || !commit.manifest.beliefs.includes(beliefKey(b))) throw new Error(`belief ${ref} is not in the HEAD commit — commit first`);
      return b;
    });
    const tree = buildCommitTree(this.beliefsAt(head), commit.manifest.tombstones);
    const keys = [...new Set(used.map(beliefKey))].sort();
    const body = {
      engram: "receipt" as const,
      v: 1 as const,
      agent: this.agent,
      commitId: head,
      ts: Date.now(),
      action: input.action,
      inputHash: sha256Hex(canonical(input.input ?? null)),
      beliefs: keys,
      proofs: Object.fromEntries(keys.map((k) => [k, proofFor(tree, k)])),
      agentPubKey: this.publicKey,
    };
    const id = `r_${sha256Hex(canonical(body)).slice(0, 16)}`;
    const receipt: Receipt = { ...body, id, signature: this.signRaw(canonical({ ...body, id })) };
    this.store.put("receipts", id, receipt);
    return receipt;
  }

  /**
   * The runtime hook: gives `fn` the committed beliefs relevant to `task`,
   * then records a signed receipt for what it decided and which beliefs it used.
   * Before the first commit, `fn` gets no beliefs and no receipt is written.
   */
  async act<T>(
    task: { query: string; input: unknown; limit?: number },
    fn: (beliefs: Belief[]) => Promise<{ action: string; used: string[]; result: T }> | { action: string; used: string[]; result: T },
  ): Promise<{ result: T; action: string; receipt: Receipt | null; beliefs: Belief[] }> {
    const head = this.head();
    let beliefs: Belief[] = [];
    if (head) {
      const committed = new Map(this.beliefsAt(head).map((b) => [b.id, b]));
      const relevant = (await this.relevant(task.query, task.limit ?? 6)).map((b) => committed.get(b.id)).filter((b): b is Belief => !!b);
      // Always include committed beliefs that `relevant` missed only if there are few of them.
      beliefs = committed.size <= (task.limit ?? 6) ? [...committed.values()] : relevant;
    }
    const out = await fn(beliefs);
    const allowed = new Set(beliefs.map((b) => b.id));
    const used = [...new Set(out.used.map((u) => u.split("@")[0]!))].filter((u) => allowed.has(u));
    const receipt = head ? this.decide({ action: out.action, input: task.input, beliefs: used }) : null;
    return { result: out.result, action: out.action, receipt, beliefs };
  }

  receipts(): Receipt[] {
    return this.store.list<Receipt>("receipts").sort((a, b) => a.ts - b.ts);
  }

  receipt(id: string): Receipt | null {
    if (!/^r_[0-9a-f]+$/.test(id)) return null;
    if (id.length < 18) {
      const hits = this.receipts().filter((r) => r.id.startsWith(id));
      return hits.length === 1 ? hits[0]! : null;
    }
    return this.store.get<Receipt>("receipts", id);
  }

  // ---- Verify ----------------------------------------------------------------

  /**
   * Checks a commit end to end: ID, signature, Merkle root rebuilt from the
   * beliefs, the parent chain, the manifest on Walrus Memory, and the Sui anchor.
   */
  async verifyCommit(ref: string, opts: VerifyOptions = {}): Promise<VerifyReport> {
    const checks: Check[] = [];
    const add = (name: string, ok: boolean, detail: string, skipped = false) => checks.push({ name, ok, detail, skipped });
    const id = this.resolve(ref);
    const c = this.getCommit(id)!;
    const m = c.manifest;

    add("id", commitId(m) === c.id, "sha256 of the manifest matches the commit ID");
    add("signature", m.agentPubKey === this.publicKey && verifyManifestSignature(m, c.signature), `Ed25519 by agent ${m.agentPubKey.slice(0, 12)}…`);

    let rootOk = false;
    let rootDetail = "";
    try {
      const beliefs = m.beliefs.map((k) => {
        const b = this.belief(k);
        if (!b) throw new Error(`missing belief ${k}`);
        return b;
      });
      const root = buildCommitTree(beliefs, m.tombstones).tree.root;
      rootOk = root === m.merkleRoot;
      rootDetail = rootOk ? `${m.beliefs.length} beliefs + ${m.tombstones.length} tombstones → root ${m.merkleRoot.slice(0, 12)}…` : "beliefs on disk do not match the committed root (tampered?)";
    } catch (err) {
      rootDetail = (err as Error).message;
    }
    add("merkle root", rootOk, rootDetail);

    let chainOk = true;
    let chainDetail = "";
    let depth = 0;
    for (let p = m.parent; p; depth++) {
      const pc = this.getCommit(p);
      if (!pc || commitId(pc.manifest) !== pc.id || !verifyManifestSignature(pc.manifest, pc.signature)) {
        chainOk = false;
        chainDetail = `parent ${p.slice(0, 8)} is missing or invalid`;
        break;
      }
      p = pc.manifest.parent;
    }
    add("history", chainOk, chainOk ? `${depth} earlier commit(s), all signed and hash-linked` : chainDetail);

    if (opts.walrus === false) add("walrus", true, "skipped", true);
    else if (!c.manifestBlobId) add("walrus", false, "manifest was never stored on Walrus");
    else if (this.remote.probeBlob) {
      // Verifier without the owner's key: check the blob is stored on Walrus instead of reading it.
      try {
        const r = await this.remote.probeBlob(c.manifestBlobId);
        add("walrus", r.ok, r.detail);
      } catch (err) {
        add("walrus", true, `could not reach Walrus: ${(err as Error).message}`, true);
      }
    } else {
      try {
        const hits = await this.remote.search(this.config.namespaces.commits, `Engram commit ${c.id}`, 10, { deep: true });
        const hit = hits.find((h) => h.blobId === c.manifestBlobId);
        const ok = !!hit && hit.text === commitText(c.id, m, c.signature);
        add("walrus", ok, ok ? `manifest recalled from Walrus Memory, blob ${c.manifestBlobId.slice(0, 10)}…` : hit ? "manifest on Walrus differs from local copy" : "manifest not found in Walrus Memory recall");
      } catch (err) {
        add("walrus", true, `could not reach Walrus Memory: ${(err as Error).message}`, true);
      }
    }

    if (opts.chain === false) add("sui anchor", true, "skipped", true);
    else if (!this.anchorer) add("sui anchor", true, "no anchorer configured", true);
    else if (!c.anchor || !c.manifestBlobId) add("sui anchor", false, "commit has no anchor yet (run `engram anchor`)");
    else {
      try {
        const r = await this.anchorer.check(c.anchor, c.manifestBlobId, c);
        const timeOk = !r.timestampMs || r.timestampMs >= m.ts - 5 * 60_000;
        add("sui anchor", r.ok && timeOk, r.ok && !timeOk ? "anchor is older than the commit — impossible" : r.detail);
        if (r.ok && r.timestampMs) add("anchored at", true, new Date(r.timestampMs).toISOString());
      } catch (err) {
        add("sui anchor", true, `could not reach Sui RPC: ${(err as Error).message}`, true);
      }
    }
    return { ok: checks.every((x) => x.ok), checks };
  }

  /** Checks a receipt: its signature, each belief's Merkle proof, then the commit it points at. */
  async verifyReceipt(id: string, opts: VerifyOptions = {}): Promise<VerifyReport> {
    const r = this.receipt(id);
    if (!r) throw new Error(`unknown receipt ${id}`);
    const checks: Check[] = [];
    const { signature, blobId: _b, ...body } = r;
    checks.push({ name: "receipt signature", ok: r.agentPubKey === this.publicKey && verifySignature(canonical(body), signature, r.agentPubKey), detail: `"${r.action}" signed by the agent` });
    const c = this.getCommit(r.commitId);
    if (!c) return { ok: false, checks: [...checks, { name: "commit", ok: false, detail: `receipt points at unknown commit ${r.commitId.slice(0, 8)}` }] };
    const bad = r.beliefs.filter((k) => {
      const b = this.belief(k);
      const proof = r.proofs[k];
      return !b || !proof || !verifyBeliefProof(b, proof, c.manifest.merkleRoot);
    });
    checks.push({ name: "belief proofs", ok: bad.length === 0, detail: bad.length ? `invalid proof for ${bad.join(", ")}` : `${r.beliefs.length} belief(s) proven to be in commit ${c.id.slice(0, 8)}` });
    checks.push({ name: "timing", ok: r.ts >= c.manifest.ts, detail: "decision made after its commit" });
    const commitReport = await this.verifyCommit(c.id, opts);
    checks.push(...commitReport.checks.map((x) => ({ ...x, name: `commit ${x.name}` })));
    return { ok: checks.every((x) => x.ok), checks };
  }

  // ---- Forget ----------------------------------------------------------------

  /**
   * Crypto-shredding: destroys the episode's key so its ciphertext (local and
   * on Walrus) can never be decrypted again. Beliefs that relied on it lose
   * that evidence — and are retracted if nothing else supports them. The next
   * commit records a tombstone.
   */
  forget(episodeId: string, reason = "forgotten on request"): ForgetResult {
    const ep = this.episode(episodeId);
    if (!ep) throw new Error(`unknown episode ${episodeId}`);
    if (ep.forgottenAt) throw new Error(`episode ${episodeId} was already forgotten`);
    this.vault.destroy(ep.keyId);
    const episode: Episode = { ...ep, forgottenAt: Date.now(), summary: undefined };
    this.store.put("episodes", ep.id, episode);
    const out: ForgetResult = { episode, revised: [], retracted: [] };
    for (const b of this.beliefs().filter((x) => x.evidence.includes(episodeId))) {
      const rest = b.evidence.filter((x) => x !== episodeId);
      if (rest.length === 0) out.retracted.push(this.applyOp({ op: "retract", belief: b.id, reason: `${reason}: its only evidence ${episodeId} was forgotten` }));
      else out.revised.push(this.applyOp({ op: "revise", belief: b.id, statement: b.statement, confidence: b.confidence, evidence: rest, tags: b.tags, reason: `${reason}: evidence ${episodeId} removed` }));
    }
    return out;
  }

  // ---- Sync ----------------------------------------------------------------

  /** Uploads everything not yet on Walrus Memory and records the blob IDs. */
  async push(): Promise<PushResult> {
    const ns = this.config.namespaces;
    // A forgotten episode that never left this machine doesn't need to.
    const eps = this.episodes().filter((e) => !e.blobId && !e.forgottenAt);
    const bels = this.beliefVersions().filter((b) => !b.blobId);
    const recs = this.receipts().filter((r) => !r.blobId);
    const items = [
      ...eps.map((e) => ({ namespace: ns.episodes, text: canonical(e.envelope) })),
      ...bels.map((b) => ({ namespace: ns.beliefs, text: beliefText(b) })),
      ...recs.map((r) => ({ namespace: ns.receipts, text: receiptText(r) })),
    ];
    const blobIds = await this.remote.putMany(items);
    eps.forEach((e, i) => this.store.put("episodes", e.id, { ...this.episode(e.id)!, blobId: blobIds[i] }));
    bels.forEach((b, i) => this.store.put("beliefs", beliefKey(b), { ...b, blobId: blobIds[eps.length + i] }));
    recs.forEach((r, i) => this.store.put("receipts", r.id, { ...r, blobId: blobIds[eps.length + bels.length + i] }));
    return { episodes: eps.length, beliefs: bels.length, receipts: recs.length };
  }
}

const BELIEF_MARK = "\n\nengram:";

/** How a belief is written to Walrus Memory: readable statement first (for semantic recall), then the full record. */
export function beliefText(b: Belief): string {
  return `${b.statement}${BELIEF_MARK}${canonical({ ...b, blobId: undefined })}`;
}

/** Returns "id@version" from a belief text, or null if it isn't one. */
export function parseBeliefText(text: string): string | null {
  const i = text.lastIndexOf(BELIEF_MARK);
  if (i < 0) return null;
  try {
    const b = JSON.parse(text.slice(i + BELIEF_MARK.length)) as Belief;
    return typeof b.id === "string" && typeof b.version === "number" ? beliefKey(b) : null;
  } catch {
    return null;
  }
}

/** How a commit is written to Walrus Memory. */
export function commitText(id: string, manifest: CommitManifest, signature: string): string {
  return `Engram commit ${id} by ${manifest.agent}: ${manifest.message}${BELIEF_MARK}${canonical({ id, manifest, signature })}`;
}

/** How a receipt is written to Walrus Memory. */
export function receiptText(r: Receipt): string {
  return `Engram receipt ${r.id} by ${r.agent}: ${r.action}${BELIEF_MARK}${canonical({ ...r, blobId: undefined })}`;
}

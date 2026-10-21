import { join, resolve } from "node:path";
import { canonical, decrypt, encrypt, generateKeyPair, hexToBytes, newDataKey, publicKeyOf, randomId, sha256Hex, sign } from "./crypto.js";
import { LocalStore } from "./store.js";
import { KeyVault } from "./vault.js";
import type { RemoteMemory } from "./remote.js";
import type { LLM } from "./llm.js";
import { proposeOps, type BeliefOp } from "./consolidator.js";
import type { Anchorer } from "./anchor.js";
import { buildCommitTree, commitId } from "./proof.js";
import type { Belief, Commit, CommitManifest, Envelope, Episode, EpisodeContent, EpisodeSource } from "./types.js";

export class NothingToCommitError extends Error {
  constructor() {
    super("nothing to commit — beliefs are unchanged since the last commit");
  }
}

export interface BeliefDiff {
  added: Belief[];
  /** [before, after] */
  changed: [Belief, Belief][];
  removed: Belief[];
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

  private constructor(store: LocalStore, remote: RemoteMemory, anchorer?: Anchorer) {
    this.store = store;
    this.remote = remote;
    this.anchorer = anchorer;
    const config = store.file<EngramConfig>("config.json").read();
    if (!config) throw new Error(`No Engram repo at ${store.root}. Run \`engram init\` first.`);
    this.config = config;
    const sk = store.readText("agent.key");
    const mk = store.readText("master.key");
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
    return new Engram(new LocalStore(join(resolve(opts.dir ?? "."), ".engram")), opts.remote, opts.anchorer);
  }

  get agent(): string {
    return this.config.agent;
  }

  get publicKey(): string {
    return this.config.agentPubKey;
  }

  /** Signs with the agent key (commits and receipts). */
  protected signRaw(message: string): string {
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
        ? { id: prev.id, version: prev.version + 1, statement: op.statement, confidence: op.confidence, evidence: [...op.evidence].sort(), tags: op.tags.length ? op.tags : prev.tags, supersedes: beliefKey(prev), status: "active", createdAt: now, reason: op.reason }
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
    if (!opts.allowEmpty && !parentCommit && beliefs.length === 0 && tombstones.length === 0) throw new NothingToCommitError();

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
    const anchor = await this.anchorer.find(c.manifestBlobId);
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

  /** The episodes behind a belief version, decrypted where possible. */
  blame(ref: string): { belief: Belief; history: Belief[]; evidence: BlameEntry[] } {
    const belief = this.belief(ref);
    if (!belief) throw new Error(`unknown belief ${ref}`);
    const evidence = belief.evidence.map((id) => {
      const episode = this.episode(id);
      if (!episode) throw new Error(`belief ${ref} cites missing episode ${id}`);
      return { episode, content: episode.forgottenAt ? null : this.read(id) };
    }).sort((a, b) => a.episode.ts - b.episode.ts);
    return { belief, history: this.history(belief.id).filter((b) => b.version <= belief.version), evidence };
  }

  // ---- Sync ----------------------------------------------------------------

  /** Uploads everything not yet on Walrus Memory and records the blob IDs. */
  async push(): Promise<PushResult> {
    const ns = this.config.namespaces;
    const eps = this.episodes().filter((e) => !e.blobId);
    const bels = this.beliefVersions().filter((b) => !b.blobId);
    const items = [
      ...eps.map((e) => ({ namespace: ns.episodes, text: canonical(e.envelope) })),
      ...bels.map((b) => ({ namespace: ns.beliefs, text: beliefText(b) })),
    ];
    const blobIds = await this.remote.putMany(items);
    eps.forEach((e, i) => this.store.put("episodes", e.id, { ...e, blobId: blobIds[i] }));
    bels.forEach((b, i) => this.store.put("beliefs", beliefKey(b), { ...b, blobId: blobIds[eps.length + i] }));
    return { episodes: eps.length, beliefs: bels.length, receipts: 0 };
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

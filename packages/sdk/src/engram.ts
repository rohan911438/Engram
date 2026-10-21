import { join, resolve } from "node:path";
import { canonical, decrypt, encrypt, generateKeyPair, hexToBytes, newDataKey, publicKeyOf, randomId, sha256Hex, sign } from "./crypto.js";
import { LocalStore } from "./store.js";
import { KeyVault } from "./vault.js";
import type { RemoteMemory } from "./remote.js";
import type { LLM } from "./llm.js";
import { proposeOps, type BeliefOp } from "./consolidator.js";
import type { Belief, Envelope, Episode, EpisodeContent, EpisodeSource } from "./types.js";

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
  private secretKey: string;

  private constructor(store: LocalStore, remote: RemoteMemory) {
    this.store = store;
    this.remote = remote;
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
    return new Engram(store, opts.remote);
  }

  static open(opts: OpenOptions): Engram {
    return new Engram(new LocalStore(join(resolve(opts.dir ?? "."), ".engram")), opts.remote);
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

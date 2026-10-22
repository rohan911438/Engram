import { MemWal } from "@mysten-incubation/memwal";
import { MemWalManual } from "@mysten-incubation/memwal/manual";
import { sha256Bytes } from "./crypto.js";

export interface RemoteHit {
  blobId: string;
  text: string;
  distance: number;
}

/**
 * Durable remote for Engram objects. The real one is Walrus Memory;
 * tests use the in-memory one.
 */
export interface RemoteMemory {
  /** Stores each text and returns its Walrus blob ID, in order. */
  putMany(items: { namespace: string; text: string }[]): Promise<string[]>;
  /**
   * `deep`: also look where cheap search can't (e.g. Walrus Memory manual-mode
   * records) — for verification, which needs one exact record.
   */
  search(namespace: string, query: string, limit?: number, opts?: SearchOptions): Promise<RemoteHit[]>;
}

export interface SearchOptions {
  deep?: boolean;
}

export interface WalrusMemoryConfig {
  key: string;
  accountId: string;
  serverUrl?: string;
  /**
   * Manual-mode fallback: when the relayer's own embedding service fails, Engram
   * embeds locally, Seal-encrypts with the account owner's key and has the relayer
   * only store the ciphertext + vector. Reads use the same path.
   */
  manual?: ManualModeConfig;
}

export interface ManualModeConfig {
  /** Account owner's Sui private key (suiprivkey1…) — Seal encrypt/decrypt. */
  suiPrivateKey: string;
  /** Text → embedding vector (1536 dims, like the relayer's own). */
  embed: (text: string) => Promise<number[]>;
  /** Walrus Memory Move package and AccountRegistry (mainnet defaults). */
  packageId?: string;
  registryId?: string;
  /** Sui client for Seal and Walrus reads (a gRPC client works). */
  suiClient: unknown;
}

/** Walrus Memory on Sui Mainnet (read from the account object and its creating transaction). */
export const MEMWAL_MAINNET = {
  packageId: "0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5",
  registryId: "0x8bf82c9e09e36b8d1c38298f68b7cb68e7b8762887e7592add9986d5e9cf199f",
};

/** Errors that mean the relayer's server-side pipeline is down (not our request). */
const RELAYER_DOWN = /embedding|internal error|internal server error|\b5\d\d\b|unavailable|timed? ?out/i;

export class WalrusMemoryRemote implements RemoteMemory {
  private client: MemWal;
  private manualClient?: MemWalManual;
  /** Until when writes go straight to manual mode after a relayer failure. */
  private manualUntil = 0;
  /** Set when the last write used the manual fallback (for logs and the UI). */
  lastWriteMode: "relayer" | "manual" = "relayer";

  constructor(private cfg: WalrusMemoryConfig) {
    this.client = MemWal.create({
      key: cfg.key,
      accountId: cfg.accountId,
      serverUrl: cfg.serverUrl ?? "https://relayer.memory.walrus.xyz",
      requestTimeoutMs: 60_000,
    });
  }

  private manual(): MemWalManual | undefined {
    const m = this.cfg.manual;
    if (!m) return undefined;
    if (!this.manualClient) {
      this.manualClient = MemWalManual.create({
        key: this.cfg.key,
        accountId: this.cfg.accountId,
        serverUrl: this.cfg.serverUrl ?? "https://relayer.memory.walrus.xyz",
        suiPrivateKey: m.suiPrivateKey,
        suiClient: m.suiClient,
        embeddingApiKey: "local", // embedding is done by m.embed below
        packageId: m.packageId ?? MEMWAL_MAINNET.packageId,
        registryId: m.registryId ?? MEMWAL_MAINNET.registryId,
      });
      // The SDK only knows OpenAI-style embedding APIs; use ours instead.
      (this.manualClient as unknown as { embed: (t: string) => Promise<number[]> }).embed = m.embed;
    }
    return this.manualClient;
  }

  async putMany(items: { namespace: string; text: string }[]): Promise<string[]> {
    if (items.length === 0) return [];
    const manual = this.manual();
    if (manual && Date.now() < this.manualUntil) return this.putManual(manual, items);
    try {
      const ids = await this.putRelayer(items);
      this.lastWriteMode = "relayer";
      return ids;
    } catch (err) {
      if (!manual || !RELAYER_DOWN.test((err as Error).message)) throw err;
      this.manualUntil = Date.now() + 10 * 60_000;
      return this.putManual(manual, items);
    }
  }

  private async putManual(manual: MemWalManual, items: { namespace: string; text: string }[]): Promise<string[]> {
    const out: string[] = [];
    // Three at a time keeps Seal key servers and the embedder within rate limits.
    for (let i = 0; i < items.length; i += 3) {
      const batch = items.slice(i, i + 3);
      const res = await Promise.all(batch.map((it) => relayerRetry(() => manual.rememberManual(it.text, it.namespace))));
      for (const r of res) {
        if (!r.blob_id) throw new Error("Walrus Memory manual write returned no blob ID");
        out.push(r.blob_id);
      }
    }
    this.lastWriteMode = "manual";
    return out;
  }

  private async putRelayer(items: { namespace: string; text: string }[]): Promise<string[]> {
    const out: string[] = [];
    // Keep batches small so one slow item doesn't hold up everything.
    for (let i = 0; i < items.length; i += 20) {
      const batch = items.slice(i, i + 20);
      const res = await relayerRetry(() => this.client.rememberBulkAndWait(batch, { timeoutMs: 300_000 }));
      batch.forEach((_, j) => {
        const r = res.results[j];
        if (!r || r.status !== "done" || !r.blob_id) {
          throw new Error(`Walrus Memory write failed: ${r?.error ?? r?.status ?? "no result"}`);
        }
        out.push(r.blob_id);
      });
    }
    return out;
  }

  /**
   * Relayer recall first. Manual-mode recall (embed locally, decrypt here) runs
   * when the relayer fails, or for a deep search — it is slower and only sees
   * records written in manual mode. Results are merged by blob ID.
   */
  async search(namespace: string, query: string, limit = 10, opts: SearchOptions = {}): Promise<RemoteHit[]> {
    const manual = this.manual();
    let auto: RemoteHit[] = [];
    let autoErr: unknown = null;
    try {
      const res = await relayerRetry(() => this.client.recall({ query, limit, namespace }));
      auto = res.results.map((r) => ({ blobId: r.blob_id, text: r.text, distance: r.distance }));
    } catch (err) {
      autoErr = err;
    }
    if (!manual || (!autoErr && !opts.deep)) {
      if (autoErr) throw autoErr;
      return auto;
    }
    let man: RemoteHit[] = [];
    try {
      man = await quietSealLogs(() => manual.recallManual(query, { limit, namespace })).then((res) =>
        res.results.flatMap((r) => ("text" in r ? [{ blobId: r.blob_id, text: r.text, distance: r.distance }] : [])),
      );
    } catch (err) {
      if (autoErr) throw autoErr;
    }
    const merged = new Map<string, RemoteHit>();
    for (const r of [...auto, ...man]) {
      const prev = merged.get(r.blobId);
      if (!prev || r.distance < prev.distance) merged.set(r.blobId, r);
    }
    return [...merged.values()].sort((x, y) => x.distance - y.distance).slice(0, limit);
  }

  async health(): Promise<boolean> {
    return (await this.client.health()).status === "ok";
  }
}

/** Offline stand-in. Blob IDs are sha256 of the text, base64url. */
export class InMemoryRemote implements RemoteMemory {
  readonly items: { namespace: string; text: string; blobId: string }[] = [];

  async putMany(items: { namespace: string; text: string }[]): Promise<string[]> {
    return items.map((it) => {
      const blobId = Buffer.from(sha256Bytes(Buffer.from(it.namespace + "\n" + it.text))).toString("base64url");
      this.items.push({ ...it, blobId });
      return blobId;
    });
  }

  async search(namespace: string, query: string, limit = 10): Promise<RemoteHit[]> {
    const words = query.toLowerCase().split(/\W+/).filter(Boolean);
    return this.items
      .filter((i) => i.namespace === namespace)
      .map((i) => {
        const t = i.text.toLowerCase();
        const hits = words.filter((w) => t.includes(w)).length;
        return { blobId: i.blobId, text: i.text, distance: words.length ? 1 - hits / words.length : 1 };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
  }
}

/**
 * Writes go to `primary`; searches merge `primary` and `secondary`. Used when an
 * agent moves to its owner's own Walrus Memory account: older memories stay
 * readable (and verifiable) in the account they were written to.
 */
export class CombinedRemote implements RemoteMemory {
  constructor(
    readonly primary: RemoteMemory,
    readonly secondary: RemoteMemory,
  ) {}

  putMany(items: { namespace: string; text: string }[]): Promise<string[]> {
    return this.primary.putMany(items);
  }

  async search(namespace: string, query: string, limit = 10, opts?: SearchOptions): Promise<RemoteHit[]> {
    const [a, b] = await Promise.allSettled([this.primary.search(namespace, query, limit, opts), this.secondary.search(namespace, query, limit, opts)]);
    if (a.status === "rejected" && b.status === "rejected") throw a.reason;
    const merged = new Map<string, RemoteHit>();
    for (const h of [...(a.status === "fulfilled" ? a.value : []), ...(b.status === "fulfilled" ? b.value : [])]) {
      const prev = merged.get(h.blobId);
      if (!prev || h.distance < prev.distance) merged.set(h.blobId, h);
    }
    return [...merged.values()].sort((x, y) => x.distance - y.distance).slice(0, limit);
  }
}

/**
 * Manual recall tries to decrypt every hit in the namespace, including records
 * written by the relayer under a different Seal identity; the SDK logs each of
 * those expected failures. Keep them out of the agent's output.
 */
async function quietSealLogs<T>(fn: () => Promise<T>): Promise<T> {
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("[MemWalManual]")) return;
    orig(...args);
  };
  try {
    return await fn();
  } finally {
    console.error = orig;
  }
}

/**
 * The relayer limits each key to 60 weighted requests a minute and answers 429
 * with retry_after_seconds; it also has brief 5xx hiccups. Wait and retry
 * instead of failing.
 */
export async function relayerRetry<T>(fn: () => Promise<T>, opts: { attempts?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = String((err as Error).message ?? err);
      const limited = /\b429\b|rate limit/i.test(msg);
      // Transient server errors (the relayer has been flaky) get a short backoff too.
      const transient = /\b50[0234]\b|internal server error|ECONNRESET|fetch failed/i.test(msg);
      if (i + 1 >= attempts || (!limited && !transient)) throw err;
      const after = limited ? Number(/retry_after_seconds"?\s*:\s*(\d+)/.exec(msg)?.[1] ?? 30) : 5 * (i + 1);
      await sleep(Math.min(after, 90) * 1000 + 500);
    }
  }
}

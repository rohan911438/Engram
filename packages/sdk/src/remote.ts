import { MemWal } from "@mysten-incubation/memwal";
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
  search(namespace: string, query: string, limit?: number): Promise<RemoteHit[]>;
}

export interface WalrusMemoryConfig {
  key: string;
  accountId: string;
  serverUrl?: string;
}

export class WalrusMemoryRemote implements RemoteMemory {
  private client: MemWal;

  constructor(cfg: WalrusMemoryConfig) {
    this.client = MemWal.create({
      key: cfg.key,
      accountId: cfg.accountId,
      serverUrl: cfg.serverUrl ?? "https://relayer.memory.walrus.xyz",
      requestTimeoutMs: 60_000,
    });
  }

  async putMany(items: { namespace: string; text: string }[]): Promise<string[]> {
    if (items.length === 0) return [];
    const out: string[] = [];
    // Keep batches small so one slow item doesn't hold up everything.
    for (let i = 0; i < items.length; i += 20) {
      const batch = items.slice(i, i + 20);
      const res = await this.client.rememberBulkAndWait(batch, { timeoutMs: 300_000 });
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

  async search(namespace: string, query: string, limit = 10): Promise<RemoteHit[]> {
    const res = await this.client.recall({ query, limit, namespace });
    return res.results.map((r) => ({ blobId: r.blob_id, text: r.text, distance: r.distance }));
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

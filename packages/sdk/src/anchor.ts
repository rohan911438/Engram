import type { TatumSui } from "./tatum.js";
import type { Anchor } from "./types.js";

/** Finds (and later re-checks) the on-chain record of a stored manifest. */
export interface Anchorer {
  /** Locates the Sui record for a Walrus blob. Null if it isn't visible yet. */
  find(blobId: string): Promise<Anchor | null>;
}

/**
 * Option A anchoring: every Walrus Memory write registers a Walrus `Blob`
 * object on Sui, owned by the account owner. The commit manifest's blob is
 * that anchor — its creating transaction fixes the time on-chain.
 * All reads go through Tatum's Sui RPC.
 */
export class WalrusBlobAnchorer implements Anchorer {
  private owner?: string;

  constructor(
    private tatum: TatumSui,
    private memwalAccountId: string,
    private opts: { retries?: number; delayMs?: number } = {},
  ) {}

  async ownerAddress(): Promise<string> {
    this.owner ??= await this.tatum.memwalAccountOwner(this.memwalAccountId);
    return this.owner;
  }

  async find(blobId: string): Promise<Anchor | null> {
    const owner = await this.ownerAddress();
    const retries = this.opts.retries ?? 4;
    for (let attempt = 0; attempt <= retries; attempt++) {
      for await (const b of this.tatum.ownedBlobs(owner)) {
        if (b.blobId !== blobId) continue;
        const tx = await this.tatum.getTransaction(b.previousTransaction);
        return { method: "walrus-blob", objectId: b.objectId, txDigest: tx.digest, checkpoint: tx.checkpoint, timestampMs: tx.timestampMs };
      }
      if (attempt < retries) await new Promise((r) => setTimeout(r, this.opts.delayMs ?? 4000));
    }
    return null;
  }
}

/** Offline anchorer for tests: pretends every blob is on-chain at a fixed time. */
export class FakeAnchorer implements Anchorer {
  readonly anchored = new Map<string, Anchor>();
  async find(blobId: string): Promise<Anchor | null> {
    let a = this.anchored.get(blobId);
    if (!a) {
      a = { method: "walrus-blob", objectId: `0xobj_${blobId.slice(0, 8)}`, txDigest: `tx_${blobId.slice(0, 8)}`, checkpoint: String(this.anchored.size + 1), timestampMs: Date.now() };
      this.anchored.set(blobId, a);
    }
    return a;
  }
}

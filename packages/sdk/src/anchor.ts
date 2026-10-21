import { blobIdFromU256, type TatumSui } from "./tatum.js";
import type { Anchor } from "./types.js";

export interface AnchorCheck {
  ok: boolean;
  detail: string;
  timestampMs?: number;
}

/** Finds and re-checks the on-chain record of a stored manifest. */
export interface Anchorer {
  /** Locates the Sui record for a Walrus blob. Null if it isn't visible yet. */
  find(blobId: string): Promise<Anchor | null>;
  /** Independently re-reads the chain to confirm an anchor. */
  check(anchor: Anchor, blobId: string): Promise<AnchorCheck>;
}

/**
 * Option A anchoring: every Walrus Memory write registers a Walrus `Blob`
 * object on Sui, owned by the account owner. The commit manifest's blob is
 * that anchor — its certifying transaction fixes the time on-chain.
 * All reads go through Tatum's Sui RPC.
 */
export class WalrusBlobAnchorer implements Anchorer {
  private owner?: string;

  constructor(
    readonly tatum: TatumSui,
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

  async check(anchor: Anchor, blobId: string): Promise<AnchorCheck> {
    const obj = await this.tatum.getObject(anchor.objectId);
    if (!obj) return { ok: false, detail: `Sui object ${anchor.objectId} not found` };
    const fields = obj.content?.fields as { blob_id?: string; certified_epoch?: number | null } | undefined;
    if (!obj.type?.endsWith("::blob::Blob") || !fields?.blob_id) return { ok: false, detail: `object is not a Walrus Blob (${obj.type})` };
    if (blobIdFromU256(fields.blob_id) !== blobId) return { ok: false, detail: "on-chain blob_id does not match the manifest blob" };
    if (fields.certified_epoch == null) return { ok: false, detail: "blob is registered but not certified" };
    const owner = (obj.owner as { AddressOwner?: string } | undefined)?.AddressOwner;
    if (owner && owner !== (await this.ownerAddress())) return { ok: false, detail: `blob owned by ${owner}, not the Walrus Memory account owner` };
    const tx = await this.tatum.getTransaction(anchor.txDigest);
    if (!tx.checkpoint) return { ok: false, detail: `transaction ${anchor.txDigest} not found` };
    if (anchor.checkpoint && tx.checkpoint !== anchor.checkpoint) return { ok: false, detail: `checkpoint mismatch (${tx.checkpoint} vs ${anchor.checkpoint})` };
    return { ok: true, detail: `Walrus Blob ${short(anchor.objectId)} certified, tx ${short(tx.digest)} in checkpoint ${tx.checkpoint}`, timestampMs: tx.timestampMs };
  }
}

const short = (s: string) => (s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s);

/** Offline anchorer for tests: pretends every blob is on-chain. */
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
  async check(anchor: Anchor, blobId: string): Promise<AnchorCheck> {
    const a = this.anchored.get(blobId);
    return a && a.txDigest === anchor.txDigest && a.objectId === anchor.objectId
      ? { ok: true, detail: `fake anchor ${a.txDigest}`, timestampMs: a.timestampMs }
      : { ok: false, detail: "no such anchor" };
  }
}

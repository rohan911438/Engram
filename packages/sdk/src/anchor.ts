import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient, JsonRpcHTTPTransport } from "@mysten/sui/jsonRpc";
import { hexToBytes } from "./crypto.js";
import { blobIdFromU256, type TatumSui } from "./tatum.js";
import type { Anchor, Commit } from "./types.js";

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
  check(anchor: Anchor, blobId: string, commit: Commit): Promise<AnchorCheck>;
  /** Anchorers that write to chain themselves (option B) implement this instead of relying on `find`. */
  publish?(commit: Commit): Promise<Anchor | null>;
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

  async check(anchor: Anchor, blobId: string, commit: Commit): Promise<AnchorCheck> {
    if (anchor.method === "move-event") return checkMoveAnchor(this.tatum, anchor, commit);
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

// ---- Option B: own Move module ------------------------------------------------


export interface MoveAnchorerOptions {
  tatum: TatumSui;
  tatumApiKey: string;
  /** Published `engram_anchor` package ID. */
  packageId: string;
  /** Wallet that pays gas (BIP-39 phrase). */
  mnemonic: string;
}

/**
 * Option B anchoring: each commit calls `engram_anchor::anchor::anchor`, which
 * emits an `Anchored` event with the commit ID and Merkle root in the clear.
 * The transaction is sent and later re-read through Tatum's Sui RPC.
 */
export class MoveAnchorer implements Anchorer {
  private client: SuiJsonRpcClient;
  private keypair: Ed25519Keypair;

  constructor(private opts: MoveAnchorerOptions) {
    this.keypair = Ed25519Keypair.deriveKeypair(opts.mnemonic.trim());
    this.client = new SuiJsonRpcClient({
      network: "mainnet",
      transport: new JsonRpcHTTPTransport({ url: opts.tatum.url, rpc: { headers: { "x-api-key": opts.tatumApiKey } } }),
    });
  }

  get address(): string {
    return this.keypair.toSuiAddress();
  }

  get eventType(): string {
    return `${this.opts.packageId}::anchor::Anchored`;
  }

  async publish(c: Commit): Promise<Anchor | null> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.opts.packageId}::anchor::anchor`,
      arguments: [
        tx.pure.vector("u8", hexToBytes(c.manifest.agentPubKey)),
        tx.pure.vector("u8", hexToBytes(c.id)),
        tx.pure.vector("u8", hexToBytes(c.manifest.merkleRoot)),
        tx.pure.vector("u8", c.manifest.parent ? hexToBytes(c.manifest.parent) : new Uint8Array()),
        tx.pure.vector("u8", new TextEncoder().encode(c.manifestBlobId ?? "")),
        tx.object.clock(),
      ],
    });
    const res = await this.client.signAndExecuteTransaction({ transaction: tx, signer: this.keypair, options: { showEffects: true } });
    if (res.effects?.status.status !== "success") throw new Error(`anchor transaction failed: ${res.effects?.status.error ?? "unknown"}`);
    await this.client.waitForTransaction({ digest: res.digest });
    const t = await this.opts.tatum.getTransaction(res.digest);
    return { method: "move-event", objectId: this.opts.packageId, txDigest: res.digest, checkpoint: t.checkpoint, timestampMs: t.timestampMs };
  }

  async find(): Promise<Anchor | null> {
    return null; // option B anchors are published, not discovered
  }

  async check(anchor: Anchor, _blobId: string, c: Commit): Promise<AnchorCheck> {
    return checkMoveAnchor(this.opts.tatum, anchor, c);
  }
}

/** Re-reads an `Anchored` event through Tatum and compares it with the commit. */
export async function checkMoveAnchor(tatum: TatumSui, anchor: Anchor, c: Commit): Promise<AnchorCheck> {
  const tx = await tatum.rpc<{ checkpoint?: string; timestampMs?: string; events?: { type: string; parsedJson?: Record<string, unknown> }[] }>("sui_getTransactionBlock", [anchor.txDigest, { showEvents: true }]);
  const ev = tx.events?.find((e) => e.type === `${anchor.objectId}::anchor::Anchored`);
  if (!ev?.parsedJson) return { ok: false, detail: `no Anchored event in tx ${anchor.txDigest}` };
  const hex = (v: unknown) => (Array.isArray(v) ? Buffer.from(v as number[]).toString("hex") : typeof v === "string" ? Buffer.from(v, "base64").toString("hex") : "");
  const j = ev.parsedJson;
  if (hex(j.commit_id) !== c.id) return { ok: false, detail: "event commit_id differs from this commit" };
  if (hex(j.merkle_root) !== c.manifest.merkleRoot) return { ok: false, detail: "event merkle_root differs from this commit" };
  if (hex(j.agent_pubkey) !== c.manifest.agentPubKey) return { ok: false, detail: "event names a different agent key" };
  return { ok: true, detail: `Anchored event: root ${c.manifest.merkleRoot.slice(0, 10)}… public in checkpoint ${tx.checkpoint}`, timestampMs: Number(tx.timestampMs ?? 0) };
}

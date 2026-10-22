import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { bcs } from "@mysten/sui/bcs";
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
    private opts: { retries?: number; delayMs?: number; /** Skip "owned by this Walrus Memory account" (for someone else's agent). */ anyOwner?: boolean } = {},
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
    if (anchor.method === "move-event") return checkMoveAnchor(anchor.network === "testnet" ? new GrpcEventReader("testnet") : this.tatum, anchor, commit);
    const obj = await this.tatum.getObject(anchor.objectId);
    if (!obj) return { ok: false, detail: `Sui object ${anchor.objectId} not found` };
    const fields = obj.content?.fields as { blob_id?: string; certified_epoch?: number | null } | undefined;
    if (!obj.type?.endsWith("::blob::Blob") || !fields?.blob_id) return { ok: false, detail: `object is not a Walrus Blob (${obj.type})` };
    if (blobIdFromU256(fields.blob_id) !== blobId) return { ok: false, detail: "on-chain blob_id does not match the manifest blob" };
    if (fields.certified_epoch == null) return { ok: false, detail: "blob is registered but not certified" };
    const owner = (obj.owner as { AddressOwner?: string } | undefined)?.AddressOwner;
    if (owner && !this.opts.anyOwner && owner !== (await this.ownerAddress())) return { ok: false, detail: `blob owned by ${owner}, not the Walrus Memory account owner` };
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

export type SuiNetwork = "mainnet" | "testnet";

export interface MoveAnchorerOptions {
  /** Published `engram_anchor` package ID. */
  packageId: string;
  /** Wallet that pays gas (BIP-39 phrase). */
  mnemonic: string;
  /** Default mainnet. Mainnet sends and re-reads through Tatum (gRPC); testnet uses the public Sui gRPC node. */
  network?: SuiNetwork;
  /** Required on mainnet. */
  tatum?: TatumSui;
  tatumApiKey?: string;
  /** Checks older commits that were anchored as Walrus Blobs. */
  blobAnchorer?: Anchorer;
}

/** The fields of one `Anchored` event, hex-encoded. */
interface AnchoredRead {
  checkpoint?: string;
  timestampMs?: number;
  event?: { commitId: string; merkleRoot: string; agentPubKey: string };
}

/** Reads the `Anchored` event of a transaction from some Sui endpoint. */
export interface AnchoredEventReader {
  readAnchored(digest: string, eventType: string): Promise<AnchoredRead>;
}

const AnchoredBcs = bcs.struct("Anchored", {
  sender: bcs.Address,
  agent_pubkey: bcs.vector(bcs.u8()),
  commit_id: bcs.vector(bcs.u8()),
  merkle_root: bcs.vector(bcs.u8()),
  parent: bcs.vector(bcs.u8()),
  manifest_blob: bcs.vector(bcs.u8()),
  timestamp_ms: bcs.u64(),
});
const toHex = (b: Iterable<number>) => Buffer.from([...b]).toString("hex");

const grpcClients = new Map<SuiNetwork, SuiGrpcClient>();
export function suiGrpc(network: SuiNetwork): SuiGrpcClient {
  let c = grpcClients.get(network);
  if (!c) grpcClients.set(network, (c = new SuiGrpcClient({ network, baseUrl: `https://fullnode.${network}.sui.io:443` })));
  return c;
}

/** Reads anchors over gRPC: a public Sui full node by network name, or any client (e.g. Tatum's). */
export class GrpcEventReader implements AnchoredEventReader {
  private client: SuiGrpcClient;
  constructor(source: SuiNetwork | SuiGrpcClient) {
    this.client = typeof source === "string" ? suiGrpc(source) : source;
  }
  async readAnchored(digest: string, eventType: string): Promise<AnchoredRead> {
    const res = await this.client.getTransaction({ digest, include: { events: true } });
    const t = res.Transaction ?? res.FailedTransaction;
    const ev = t?.events?.find((e) => e.eventType === eventType);
    const out: AnchoredRead = { checkpoint: t?.checkpoint ?? undefined, timestampMs: t?.timestampMs ?? undefined };
    if (ev && res.$kind === "Transaction") {
      const p = AnchoredBcs.parse(ev.bcs);
      out.event = { commitId: toHex(p.commit_id), merkleRoot: toHex(p.merkle_root), agentPubKey: toHex(p.agent_pubkey) };
    }
    return out;
  }
}

/** Reads anchors through Tatum's Sui Mainnet gRPC gateway. */
export function tatumEventReader(tatum: TatumSui): AnchoredEventReader {
  return new GrpcEventReader(tatum.client);
}

/**
 * Option B anchoring: each commit calls `engram_anchor::anchor::anchor`, which
 * emits an `Anchored` event with the commit ID and Merkle root in the clear.
 * Mainnet transactions are sent and re-read through Tatum's Sui gRPC gateway.
 */
export class MoveAnchorer implements Anchorer {
  private keypair: Ed25519Keypair;
  readonly network: SuiNetwork;
  private reader: AnchoredEventReader;

  constructor(private opts: MoveAnchorerOptions) {
    this.keypair = Ed25519Keypair.deriveKeypair(opts.mnemonic.trim());
    this.network = opts.network ?? "mainnet";
    if (this.network === "mainnet" && !opts.tatum) throw new Error("mainnet anchoring needs a Tatum API key");
    this.reader = this.network === "mainnet" ? tatumEventReader(opts.tatum!) : new GrpcEventReader(this.network);
  }

  get address(): string {
    return this.keypair.toSuiAddress();
  }

  get eventType(): string {
    return `${this.opts.packageId}::anchor::Anchored`;
  }

  private buildTx(c: Commit): Transaction {
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
    return tx;
  }

  private async send(c: Commit): Promise<string> {
    const client = this.network === "mainnet" ? this.opts.tatum!.client : suiGrpc(this.network);
    const res = await client.signAndExecuteTransaction({ transaction: this.buildTx(c), signer: this.keypair });
    if (res.$kind !== "Transaction") throw new Error(`anchor transaction failed: ${JSON.stringify(res.FailedTransaction?.status)}`);
    await client.waitForTransaction({ digest: res.Transaction.digest });
    return res.Transaction.digest;
  }

  async publish(c: Commit): Promise<Anchor | null> {
    const digest = await this.send(c);
    // The checkpoint can lag execution by a moment; retry briefly.
    let t: AnchoredRead = {};
    for (let i = 0; i < 6 && !t.checkpoint; i++) {
      t = await this.reader.readAnchored(digest, this.eventType);
      if (!t.checkpoint) await new Promise((r) => setTimeout(r, 1500));
    }
    const anchor: Anchor = { method: "move-event", objectId: this.opts.packageId, txDigest: digest, checkpoint: t.checkpoint, timestampMs: t.timestampMs };
    if (this.network !== "mainnet") anchor.network = this.network;
    return anchor;
  }

  async find(): Promise<Anchor | null> {
    return null; // option B anchors are published, not discovered
  }

  async check(anchor: Anchor, blobId: string, c: Commit): Promise<AnchorCheck> {
    if (anchor.method === "walrus-blob") {
      return this.opts.blobAnchorer ? this.opts.blobAnchorer.check(anchor, blobId, c) : { ok: false, detail: "Walrus Blob anchor but no Walrus Memory account configured" };
    }
    const net = anchor.network ?? "mainnet";
    if (net === this.network) return checkMoveAnchor(this.reader, anchor, c);
    if (net === "mainnet" && !this.opts.tatum) return { ok: false, detail: "mainnet anchor but no Tatum key configured" };
    return checkMoveAnchor(net === "mainnet" ? this.opts.tatum! : new GrpcEventReader(net), anchor, c);
  }
}

/** Re-reads an `Anchored` event and compares it with the commit. Accepts a Tatum client (mainnet) or any reader. */
export async function checkMoveAnchor(source: TatumSui | AnchoredEventReader, anchor: Anchor, c: Commit): Promise<AnchorCheck> {
  const reader = "readAnchored" in source ? source : tatumEventReader(source);
  const r = await reader.readAnchored(anchor.txDigest, `${anchor.objectId}::anchor::Anchored`);
  const net = anchor.network && anchor.network !== "mainnet" ? ` (${anchor.network})` : "";
  if (!r.event) return { ok: false, detail: `no Anchored event in tx ${anchor.txDigest}${net}` };
  if (r.event.commitId !== c.id) return { ok: false, detail: "event commit_id differs from this commit" };
  if (r.event.merkleRoot !== c.manifest.merkleRoot) return { ok: false, detail: "event merkle_root differs from this commit" };
  if (r.event.agentPubKey !== c.manifest.agentPubKey) return { ok: false, detail: "event names a different agent key" };
  return { ok: true, detail: `Anchored event: root ${c.manifest.merkleRoot.slice(0, 10)}… public in checkpoint ${r.checkpoint}${net}`, timestampMs: r.timestampMs };
}

/**
 * Checks anchors of an agent that isn't ours (e.g. one linked to the web app):
 * Move-event anchors on any network, and Walrus Blob anchors without the
 * "owned by our Walrus Memory account" rule.
 */
export class ForeignAnchorChecker implements Anchorer {
  private blob?: WalrusBlobAnchorer;
  constructor(private tatum?: TatumSui) {
    if (tatum) this.blob = new WalrusBlobAnchorer(tatum, "", { anyOwner: true });
  }
  async find(): Promise<Anchor | null> {
    return null;
  }
  async check(anchor: Anchor, blobId: string, c: Commit): Promise<AnchorCheck> {
    if (anchor.method === "move-event") {
      const net = anchor.network ?? "mainnet";
      if (net === "mainnet" && !this.tatum) return { ok: true, detail: "mainnet anchor not checked (no Tatum key)" };
      return checkMoveAnchor(net === "mainnet" ? this.tatum! : new GrpcEventReader(net), anchor, c);
    }
    if (!this.blob) return { ok: true, detail: "Walrus Blob anchor not checked (no Tatum key)" };
    return this.blob.check(anchor, blobId, c);
  }
}

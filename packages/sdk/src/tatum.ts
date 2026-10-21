/** Walrus `Blob` Move type on Sui Mainnet. */
export const WALRUS_BLOB_TYPE_MAINNET = "0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::blob::Blob";

export interface TatumOptions {
  apiKey: string;
  network?: "mainnet";
  /** Override the RPC URL (tests). */
  url?: string;
  fetch?: typeof fetch;
}

export interface SuiBlobObject {
  objectId: string;
  blobId: string;
  size: number;
  registeredEpoch: number;
  certifiedEpoch: number | null;
  previousTransaction: string;
}

export interface SuiTx {
  digest: string;
  checkpoint: string;
  timestampMs: number;
}

/** Walrus stores blob_id as a u256; the SDK shows it as little-endian base64url. */
export function blobIdFromU256(u256: string): string {
  let x = BigInt(u256);
  const b = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return b.toString("base64url");
}

/** Sui JSON-RPC through Tatum's gateway. All of Engram's on-chain reads go through here. */
export class TatumSui {
  readonly url: string;
  private apiKey: string;
  private fetchFn: typeof fetch;

  constructor(opts: TatumOptions) {
    this.apiKey = opts.apiKey;
    this.url = opts.url ?? "https://sui-mainnet.gateway.tatum.io";
    this.fetchFn = opts.fetch ?? fetch;
  }

  async rpc<T>(method: string, params: unknown[]): Promise<T> {
    let last = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await this.fetchFn(this.url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": this.apiKey },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(30_000),
      });
      // Free plan allows 3 requests/second — back off on rate limits.
      if (res.status === 429 || res.status >= 500) {
        last = `HTTP ${res.status}`;
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
        continue;
      }
      const body = (await res.json()) as { result?: T; error?: { message: string } };
      if (body.error) throw new Error(`Sui RPC ${method}: ${body.error.message}`);
      if (!res.ok) throw new Error(`Tatum HTTP ${res.status}`);
      return body.result as T;
    }
    throw new Error(`Tatum ${method} failed: ${last}`);
  }

  async latestCheckpoint(): Promise<string> {
    return this.rpc<string>("sui_getLatestCheckpointSequenceNumber", []);
  }

  async getObject(id: string): Promise<SuiObjectData | null> {
    const r = await this.rpc<{ data?: SuiObjectData }>("sui_getObject", [id, { showType: true, showContent: true, showOwner: true, showPreviousTransaction: true }]);
    return r.data ?? null;
  }

  /** Owner address of a Walrus Memory account (the wallet that owns the blobs). */
  async memwalAccountOwner(accountId: string): Promise<string> {
    const o = await this.getObject(accountId);
    const owner = (o?.content?.fields as { owner?: string } | undefined)?.owner;
    if (!owner) throw new Error(`Walrus Memory account ${accountId} not found on Sui`);
    return owner;
  }

  /** All Walrus Blob objects owned by an address. */
  async *ownedBlobs(owner: string, blobType = WALRUS_BLOB_TYPE_MAINNET): AsyncGenerator<SuiBlobObject> {
    let cursor: string | null = null;
    do {
      const page: OwnedPage = await this.rpc<OwnedPage>("suix_getOwnedObjects", [
        owner,
        { filter: { StructType: blobType }, options: { showContent: true, showPreviousTransaction: true } },
        cursor,
        50,
      ]);
      for (const o of page.data) {
        const f = o.data?.content?.fields as BlobFields | undefined;
        if (!o.data || !f) continue;
        yield {
          objectId: o.data.objectId,
          blobId: blobIdFromU256(f.blob_id),
          size: Number(f.size),
          registeredEpoch: Number(f.registered_epoch),
          certifiedEpoch: f.certified_epoch == null ? null : Number(f.certified_epoch),
          previousTransaction: o.data.previousTransaction ?? "",
        };
      }
      cursor = page.hasNextPage ? page.nextCursor : null;
    } while (cursor);
  }

  async getTransaction(digest: string): Promise<SuiTx> {
    const t = await this.rpc<{ digest: string; checkpoint?: string; timestampMs?: string }>("sui_getTransactionBlock", [digest, {}]);
    return { digest: t.digest, checkpoint: t.checkpoint ?? "", timestampMs: Number(t.timestampMs ?? 0) };
  }

  /** Recent transactions sent from or received by an address, newest first. */
  async transactionsOf(address: string, direction: "from" | "to", limit = 20): Promise<SuiTxDetail[]> {
    const filter = direction === "from" ? { FromAddress: address } : { ToAddress: address };
    const r = await this.rpc<{ data: SuiTxDetail[] }>("suix_queryTransactionBlocks", [
      { filter, options: { showBalanceChanges: true, showInput: true, showEffects: true } },
      null,
      limit,
      true,
    ]);
    return r.data;
  }
}

export interface SuiObjectData {
  objectId: string;
  version: string;
  type?: string;
  owner?: unknown;
  previousTransaction?: string;
  content?: { fields?: unknown };
}

export interface SuiTxDetail {
  digest: string;
  timestampMs?: string;
  checkpoint?: string;
  balanceChanges?: { owner: { AddressOwner?: string } | unknown; coinType: string; amount: string }[];
}

interface OwnedPage {
  data: { data?: SuiObjectData }[];
  hasNextPage: boolean;
  nextCursor: string | null;
}

interface BlobFields {
  blob_id: string;
  size: string;
  registered_epoch: number;
  certified_epoch: number | null;
}

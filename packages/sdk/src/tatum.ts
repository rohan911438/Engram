import { SuiGrpcClient } from "@mysten/sui/grpc";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { ChannelCredentials } from "@grpc/grpc-js";

/** Walrus `Blob` Move type on Sui Mainnet. */
export const WALRUS_BLOB_TYPE_MAINNET = "0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::blob::Blob";

/** Tatum's Sui Mainnet gRPC gateway (Sui JSON-RPC was switched off in July 2026). */
export const TATUM_SUI_GRPC_HOST = "sui-mainnet-grpc.gateway.tatum.io:443";

export interface TatumOptions {
  apiKey: string;
  network?: "mainnet";
  /** Override the gRPC host (`host:port`). */
  host?: string;
  /** Use a ready-made client instead (tests). */
  client?: SuiGrpcClient;
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

/**
 * Sui Mainnet through Tatum's gRPC gateway. All of Engram's mainnet reads (and
 * mainnet anchor transactions) go through here.
 */
export class TatumSui {
  readonly host: string;
  private apiKey: string;
  private _client?: SuiGrpcClient;

  constructor(opts: TatumOptions) {
    this.apiKey = opts.apiKey;
    this.host = opts.host ?? TATUM_SUI_GRPC_HOST;
    this._client = opts.client;
  }

  /** The Sui SDK client, connected to Tatum with native gRPC (Tatum doesn't serve gRPC-Web). */
  get client(): SuiGrpcClient {
    if (!this._client) {
      const transport = new GrpcTransport({ host: this.host, channelCredentials: ChannelCredentials.createSsl(), meta: { "x-api-key": this.apiKey } });
      this._client = new SuiGrpcClient({ network: "mainnet", transport });
    }
    return this._client;
  }

  /** Retries Tatum's transient failures (rate limit, unavailable upstream). */
  private async retry<T>(what: string, fn: () => Promise<T>): Promise<T> {
    let last: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await fn();
      } catch (err) {
        last = err;
        const msg = String((err as Error).message ?? err);
        if (!/UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE|429|503|502|ECONNRESET|healthy upstream/i.test(msg)) break;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    throw new Error(`Tatum Sui ${what}: ${(last as Error)?.message ?? last}`);
  }

  async latestCheckpoint(): Promise<string> {
    return this.retry("service info", async () => {
      const info = await this.client.ledgerService.getServiceInfo({}).response;
      return String(info.checkpointHeight ?? "");
    });
  }

  async getObject(id: string): Promise<SuiObjectData | null> {
    return this.retry("getObject", async () => {
      try {
        const { object: o } = await this.client.getObject({ objectId: id, include: { json: true, previousTransaction: true } });
        return toObjectData(o);
      } catch (err) {
        if (/not ?found/i.test(String((err as Error).message))) return null;
        throw err;
      }
    });
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
      const page = await this.retry("listOwnedObjects", () =>
        this.client.listOwnedObjects({ owner, type: blobType, cursor, limit: 50, include: { json: true, previousTransaction: true } }),
      );
      for (const o of page.objects) {
        const f = o.json as BlobFields | null;
        if (!f) continue;
        yield {
          objectId: o.objectId,
          blobId: blobIdFromU256(String(f.blob_id)),
          size: Number(f.size),
          registeredEpoch: Number(f.registered_epoch),
          certifiedEpoch: f.certified_epoch == null ? null : Number(f.certified_epoch),
          previousTransaction: o.previousTransaction ?? "",
        };
      }
      cursor = page.hasNextPage ? page.cursor : null;
    } while (cursor);
  }

  async getTransaction(digest: string): Promise<SuiTx> {
    return this.retry("getTransaction", async () => {
      const r = await this.client.getTransaction({ digest });
      const t = r.Transaction ?? r.FailedTransaction;
      return { digest: t?.digest ?? digest, checkpoint: t?.checkpoint ?? "", timestampMs: Number(t?.timestampMs ?? 0) };
    });
  }

  /** Recent transactions that touched an address (sent or received), newest first. */
  async transactionsOf(address: string, limit = 20): Promise<SuiTxDetail[]> {
    return this.retry("listTransactions", async () => {
      const call = this.client.ledgerService.listTransactions({
        readMask: { paths: ["digest", "timestamp", "checkpoint", "balance_changes", "transaction.sender"] },
        filter: { terms: [{ literals: [{ negated: false, predicate: { oneofKind: "affectedAddress", affectedAddress: { address } } }] }] },
        options: { limit, ordering: 1 /* descending */ },
      } as never);
      const out: SuiTxDetail[] = [];
      for await (const frame of call.responses as AsyncIterable<{ transaction?: GrpcExecutedTx }>) {
        const t = frame.transaction;
        if (!t?.digest) continue;
        out.push({
          digest: t.digest,
          checkpoint: t.checkpoint != null ? String(t.checkpoint) : undefined,
          timestampMs: t.timestamp ? String(Number(t.timestamp.seconds) * 1000 + Math.floor((t.timestamp.nanos ?? 0) / 1e6)) : undefined,
          transaction: { data: { sender: t.transaction?.sender } },
          balanceChanges: (t.balanceChanges ?? []).map((b) => ({ owner: { AddressOwner: b.address ?? "" }, coinType: b.coinType ?? "", amount: b.amount ?? "0" })),
        });
        if (out.length >= limit) break;
      }
      return out;
    });
  }

  /** Decimals and symbol of a coin type, or null if it has no metadata. */
  async coinMetadata(coinType: string): Promise<{ decimals: number; symbol: string } | null> {
    return this.retry("getCoinMetadata", async () => {
      const r = await this.client.getCoinMetadata({ coinType });
      return r.coinMetadata ? { decimals: r.coinMetadata.decimals, symbol: r.coinMetadata.symbol } : null;
    });
  }
}

function toObjectData(o: { objectId: string; version: string; type: string; owner: unknown; previousTransaction?: string | null; json?: Record<string, unknown> | null }): SuiObjectData {
  return { objectId: o.objectId, version: o.version, type: o.type, owner: o.owner, previousTransaction: o.previousTransaction ?? undefined, content: { fields: o.json ?? undefined } };
}

interface GrpcExecutedTx {
  digest?: string;
  checkpoint?: bigint;
  timestamp?: { seconds: bigint; nanos?: number };
  transaction?: { sender?: string };
  balanceChanges?: { address?: string; coinType?: string; amount?: string }[];
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
  transaction?: { data?: { sender?: string } };
  balanceChanges?: { owner: { AddressOwner?: string } | unknown; coinType: string; amount: string }[];
}

interface BlobFields {
  blob_id: string;
  size: string;
  registered_epoch: number;
  certified_epoch: number | null;
}

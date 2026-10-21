import type { TatumSui } from "@engram/sdk";

/** One wallet movement, in human units. This is what becomes an episode. */
export interface WalletEvent {
  digest: string;
  ts: number;
  direction: "in" | "out";
  coin: string;
  amount: number;
  /** The other side of the movement, if one address clearly is. */
  counterparty: string | null;
  /** Rough kind, so the LLM doesn't have to guess from raw data. */
  kind: "transfer" | "swap" | "gas_only";
}

interface RawTx {
  digest: string;
  timestampMs?: string;
  transaction?: { data?: { sender?: string } };
  balanceChanges?: { owner: { AddressOwner?: string } | string | Record<string, unknown>; coinType: string; amount: string }[];
}

/**
 * Reads a Sui wallet's history through Tatum's Sui RPC and turns each
 * transaction into WalletEvents. Coin decimals come from on-chain metadata.
 */
export class WalletFeed {
  private decimals = new Map<string, { decimals: number; symbol: string }>();

  constructor(
    private tatum: TatumSui,
    readonly address: string,
  ) {}

  /** Newest transactions (sent and received), oldest first, skipping digests already seen. */
  async fetch(seen: Set<string>, limit = 20): Promise<WalletEvent[]> {
    const [sent, received] = await Promise.all([
      this.tatum.transactionsOf(this.address, "from", limit) as Promise<RawTx[]>,
      this.tatum.transactionsOf(this.address, "to", limit) as Promise<RawTx[]>,
    ]);
    const byDigest = new Map<string, RawTx>();
    for (const t of [...sent, ...received]) if (!seen.has(t.digest)) byDigest.set(t.digest, t);
    const events: WalletEvent[] = [];
    for (const t of byDigest.values()) events.push(...(await this.toEvents(t)));
    return events.sort((a, b) => a.ts - b.ts);
  }

  async toEvents(t: RawTx): Promise<WalletEvent[]> {
    const ts = Number(t.timestampMs ?? Date.now());
    const changes = t.balanceChanges ?? [];
    const ownerOf = (o: unknown): string | null =>
      typeof o === "object" && o !== null && "AddressOwner" in o ? String((o as { AddressOwner: string }).AddressOwner) : null;
    const mine = changes.filter((c) => ownerOf(c.owner) === this.address);
    const others = changes.filter((c) => ownerOf(c.owner) && ownerOf(c.owner) !== this.address);
    const out: WalletEvent[] = [];
    const sender = t.transaction?.data?.sender;
    for (const c of mine) {
      const meta = await this.meta(c.coinType);
      let amount = Number(BigInt(c.amount)) / 10 ** meta.decimals;
      const direction = amount < 0 ? "out" : "in";
      // A SUI debit on our own transaction with no other change is just gas.
      if (meta.symbol === "SUI" && direction === "out" && sender === this.address && mine.length === 1 && others.length === 0) {
        out.push({ digest: t.digest, ts, direction, coin: "SUI", amount: Math.abs(amount), counterparty: null, kind: "gas_only" });
        continue;
      }
      amount = Math.abs(amount);
      const kind = mine.length > 1 && mine.some((m) => Number(m.amount) > 0) && mine.some((m) => Number(m.amount) < 0) ? "swap" : "transfer";
      const opposite = others.find((o) => o.coinType === c.coinType && Math.sign(Number(o.amount)) !== Math.sign(Number(c.amount)));
      // Swaps go through a DEX pool (shared object) — there's no person on the other side.
      let counterparty = kind === "swap" ? null : opposite ? ownerOf(opposite.owner) : direction === "in" ? (sender ?? null) : null;
      if (counterparty === this.address) counterparty = null;
      out.push({ digest: t.digest, ts, direction, coin: meta.symbol, amount: round(amount), counterparty, kind });
    }
    return out;
  }

  private async meta(coinType: string): Promise<{ decimals: number; symbol: string }> {
    let m = this.decimals.get(coinType);
    if (!m) {
      const r = await this.tatum.rpc<{ decimals: number; symbol: string } | null>("suix_getCoinMetadata", [coinType]).catch(() => null);
      m = { decimals: r?.decimals ?? 9, symbol: r?.symbol ?? coinType.split("::").pop() ?? "?" };
      this.decimals.set(coinType, m);
    }
    return m;
  }
}

const round = (x: number) => Math.round(x * 1e6) / 1e6;

/** Short label for logs and episode summaries (no full addresses). */
export function describe(e: WalletEvent): string {
  const cp = e.counterparty ? ` ${e.direction === "out" ? "to" : "from"} ${e.counterparty.slice(0, 8)}…` : "";
  return e.kind === "gas_only" ? `gas ${e.amount} SUI` : `${e.direction === "out" ? "sent" : "received"} ${e.amount} ${e.coin}${cp}${e.kind === "swap" ? " (swap)" : ""}`;
}

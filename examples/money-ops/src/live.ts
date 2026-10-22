import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { TatumSui, suiGrpc, type SuiNetwork } from "@rohankumar4179/engram-sdk";

/**
 * A real wallet story on Sui. Five wallets (owner, employer, landlord,
 * streaming service, scammer) send each other real SUI: salary in, rent and a
 * subscription out, a rent rise, and a staged theft. The money-ops agent only
 * sees the owner's wallet through the chain, exactly like any user's wallet.
 *
 * The theft is staged — the owner's key signs it — but it is an ordinary
 * on-chain transfer; nothing is simulated.
 */

export type Actor = "owner" | "employer" | "landlord" | "streaming" | "scammer";
export const ACTORS: Actor[] = ["owner", "employer", "landlord", "streaming", "scammer"];

/** Amounts in SUI. Small on purpose: the whole story moves about 0.75 SUI. */
export const AMOUNTS = { salary: 0.21, rent: 0.045, rentNew: 0.05, streaming: 0.0012, theft: 0.18, scamRepeat: 0.025 };

export type LiveStep =
  | { type: "pay"; from: Actor; to: Actor; sui: number; note: string }
  | { type: "owner"; message: (a: Record<Actor, string>) => string }
  | { type: "sleep"; label: string };

const pay = (from: Actor, to: Actor, sui: number, note: string): LiveStep => ({ type: "pay", from, to, sui, note });
const owner = (message: (a: Record<Actor, string>) => string): LiveStep => ({ type: "owner", message });
const sleep = (label: string): LiveStep => ({ type: "sleep", label });
const short = (a: string) => `${a.slice(0, 10)}…`;

export const LIVE_STORY: LiveStep[] = [
  // Month 1 — the agent knows nothing.
  pay("employer", "owner", AMOUNTS.salary, "salary"),
  pay("owner", "landlord", AMOUNTS.rent, "rent"),
  pay("owner", "streaming", AMOUNTS.streaming, "subscription"),
  owner((a) => `The ${AMOUNTS.salary} SUI from ${short(a.employer)} is my salary. The ${AMOUNTS.rent} SUI to ${short(a.landlord)} is my rent, once a month. The ${AMOUNTS.streaming} SUI to ${short(a.streaming)} is my streaming subscription.`),
  sleep("Month 1: salary, rent, subscription"),

  // Months 2–3 — same habits; the agent should stay quiet.
  pay("employer", "owner", AMOUNTS.salary, "salary"),
  pay("owner", "landlord", AMOUNTS.rent, "rent"),
  pay("owner", "streaming", AMOUNTS.streaming, "subscription"),
  pay("employer", "owner", AMOUNTS.salary, "salary"),
  pay("owner", "landlord", AMOUNTS.rent, "rent"),
  pay("owner", "streaming", AMOUNTS.streaming, "subscription"),
  sleep("Months 2–3: habits confirmed"),

  // Month 4 — one change is fine, one is theft.
  pay("owner", "landlord", AMOUNTS.rentNew, "rent (raised)"),
  owner(() => `Yes, my rent went up to ${AMOUNTS.rentNew} SUI.`),
  pay("owner", "scammer", AMOUNTS.theft, "theft"),
  owner((a) => `I did NOT send ${AMOUNTS.theft} SUI to ${short(a.scammer)} — that address is a scammer. Always treat payments to it as theft.`),
  sleep("Month 4: rent change + scam address"),

  // Month 5 — the agent applies what it learned.
  pay("owner", "landlord", AMOUNTS.rentNew, "rent"),
  pay("owner", "scammer", AMOUNTS.scamRepeat, "scam again"),
];

/** Keys for the five actors, created once and kept next to the repo (never commit them). */
export function loadActors(dir: string): Record<Actor, Ed25519Keypair> {
  const path = join(dir, "actors.json");
  let secrets: Record<string, string>;
  if (existsSync(path)) secrets = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  else {
    secrets = Object.fromEntries(ACTORS.map((a) => [a, new Ed25519Keypair().getSecretKey()]));
    writeFileSync(path, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  }
  return Object.fromEntries(ACTORS.map((a) => [a, Ed25519Keypair.fromSecretKey(secrets[a]!)])) as Record<Actor, Ed25519Keypair>;
}

/** SUI the story needs from outside: everything flows from the employer's salaries. */
export function fundingNeeded(): number {
  const gas = 0.004; // generous per-transaction gas on mainnet/testnet
  const txs = LIVE_STORY.filter((s) => s.type === "pay").length;
  const salaries = LIVE_STORY.filter((s) => s.type === "pay" && s.from === "employer").length;
  return Math.ceil((salaries * AMOUNTS.salary + txs * gas) * 100) / 100;
}

/** Chain access for the story: send SUI, read balances, and a wallet reader for the agent. */
export class LiveChain {
  readonly reader: TatumSui;
  constructor(
    readonly network: SuiNetwork,
    tatum?: TatumSui,
  ) {
    // Mainnet reads go through Tatum; testnet uses the public Sui node (Tatum has no Sui testnet).
    this.reader = network === "mainnet" ? tatum! : new TatumSui({ apiKey: "", client: suiGrpc("testnet") });
    if (!this.reader) throw new Error("mainnet needs a Tatum key");
  }

  private get client() {
    return this.network === "mainnet" ? this.reader.client : suiGrpc(this.network);
  }

  async balance(address: string): Promise<number> {
    const r = await this.client.getBalance({ owner: address });
    return Number(r.balance.balance) / 1e9;
  }

  async send(from: Ed25519Keypair, to: string, sui: number): Promise<string> {
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [Math.round(sui * 1e9)]);
    tx.transferObjects([coin!], to);
    const res = await this.client.signAndExecuteTransaction({ transaction: tx, signer: from });
    if (res.$kind !== "Transaction") throw new Error(`transfer failed: ${JSON.stringify(res.FailedTransaction?.status)}`);
    await this.client.waitForTransaction({ digest: res.Transaction.digest });
    return res.Transaction.digest;
  }

  /** Waits until the owner's wallet feed (the indexer) shows these transactions. */
  async waitIndexed(owner: string, digests: string[], timeoutMs = 90_000): Promise<void> {
    const t0 = Date.now();
    for (;;) {
      const seen = new Set((await this.reader.transactionsOf(owner, 50)).map((t) => t.digest));
      if (digests.every((d) => seen.has(d))) return;
      if (Date.now() - t0 > timeoutMs) throw new Error(`transactions not visible in the wallet feed after ${timeoutMs / 1000}s`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

import { config } from "dotenv";
import { join } from "node:path";
import { TatumSui } from "../packages/sdk/src/index.js";
config({ path: join(import.meta.dirname, "../.env"), quiet: true });
const t = new TatumSui({ apiKey: process.env.TATUM_API_KEY_MAINNET! });
const cp = await t.latestCheckpoint();
const c = await t.rpc<any>("sui_getCheckpoint", [String(Number(cp) - 5)]);
const senders = new Map<string, number>();
for (const d of c.transactions.slice(0, 25)) {
  const tx = await t.rpc<any>("sui_getTransactionBlock", [d, { showInput: true, showBalanceChanges: true }]);
  const s = tx.transaction?.data?.sender;
  const coins = (tx.balanceChanges ?? []).map((b: any) => b.coinType.split("::").pop());
  if (coins.length) senders.set(s, (senders.get(s) ?? 0) + 1);
}
console.log("USDC senders:", [...senders.keys()].slice(0, 5));
const addr = process.argv[2] ?? [...senders.keys()][0];
if (addr) {
  const txs = await t.transactionsOf(addr, "from", 3);
  for (const x of txs as any[]) console.log(x.digest, x.timestampMs, x.transaction?.data?.sender?.slice(0,10), JSON.stringify(x.balanceChanges?.map((b: any) => ({ o: (b.owner.AddressOwner ?? JSON.stringify(b.owner)).slice(0, 10), c: b.coinType.split("::").pop(), a: b.amount }))));
}

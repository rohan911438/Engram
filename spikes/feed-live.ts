import { config } from "dotenv";
import { join } from "node:path";
import { TatumSui } from "@rohankumar4179/engram-sdk";
import { WalletFeed, describe } from "../examples/money-ops/src/feed.js";
config({ path: join(import.meta.dirname, "../.env"), quiet: true });
const tatum = new TatumSui({ apiKey: process.env.TATUM_API_KEY_MAINNET! });
const cp = await tatum.latestCheckpoint();
const c = await tatum.rpc<any>("sui_getCheckpoint", [String(Number(cp) - 3)]);
let addr = "";
for (const d of c.transactions.slice(0, 30)) {
  const tx = await tatum.rpc<any>("sui_getTransactionBlock", [d, { showInput: true, showBalanceChanges: true }]);
  if ((tx.balanceChanges ?? []).length >= 2) { addr = tx.transaction.data.sender; break; }
}
console.log("address", addr);
const events = await new WalletFeed(tatum, addr).fetch(new Set(), 5);
for (const e of events) console.log(new Date(e.ts).toISOString(), e.digest.slice(0, 10), describe(e), e.kind);

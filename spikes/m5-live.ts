// Live check for M5: receipt → verify (Walrus + Sui via Tatum) → forget → commit → verify.
import { config } from "dotenv";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Engram, TatumSui, WalrusBlobAnchorer, WalrusMemoryRemote, type VerifyReport } from "../packages/sdk/src/index.js";

config({ path: join(import.meta.dirname, "../.env"), quiet: true });
const env = process.env as Record<string, string>;
const remote = new WalrusMemoryRemote({ key: env.MEMWAL_KEY, accountId: env.MEMWAL_ACCOUNT_ID, serverUrl: env.MEMWAL_SERVER_URL });
const anchorer = new WalrusBlobAnchorer(new TatumSui({ apiKey: env.TATUM_API_KEY_MAINNET }), env.MEMWAL_ACCOUNT_ID);
const e = Engram.init("spike", { dir: mkdtempSync(join(tmpdir(), "engram-m5-")), remote, anchorer });
const show = (title: string, r: VerifyReport) => {
  console.log(`\n${title}: ${r.ok ? "VALID" : "INVALID"}`);
  for (const c of r.checks) console.log(`  ${c.skipped ? "-" : c.ok ? "✔" : "✘"} ${c.name.padEnd(22)} ${c.detail}`);
};

const ep1 = e.observe({ source: "tatum", data: { amount: 450, to: "0x7a11" } });
const ep2 = e.observe({ source: "user", data: "salary 2100 from ACME on the 25th" });
e.applyOp({ op: "create", key: "rent", statement: "Owner pays 450 USDC rent to 0x7a11 monthly.", confidence: 0.8, evidence: [ep1.id], tags: ["rent"], reason: "live" });
e.applyOp({ op: "create", key: "salary", statement: "Salary of 2100 USDC arrives from ACME on the 25th.", confidence: 0.8, evidence: [ep2.id], tags: ["income"], reason: "live" });
await e.commit("live M5: two beliefs");
const r = e.decide({ action: "skip alert for 450 USDC → 0x7a11 (rent)", input: { tx: "demo" }, beliefs: ["b_rent"] });
show(`receipt ${r.id}`, await e.verifyReceipt(r.id));

const f = e.forget(ep2.id);
console.log(`\nforget ${ep2.id}: retracted ${f.retracted.map((b) => b.id)}; readable now? ${e.read(ep2.id) !== null}`);
const c2 = await e.commit("live M5: forget salary");
console.log(`commit ${c2.id.slice(0, 10)} tombstones=${c2.manifest.tombstones}`);
show("commit HEAD", await e.verifyCommit("HEAD"));
show(`old receipt ${r.id} (after forget)`, await e.verifyReceipt(r.id, { walrus: false }));
console.log("\npush:", await e.push());

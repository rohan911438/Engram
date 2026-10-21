// Live check for M3: real Gemini consolidation over a realistic wallet history.
import { config } from "dotenv";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Engram, GeminiLLM, InMemoryRemote } from "../packages/sdk/src/index.js";

config({ path: join(import.meta.dirname, "../.env"), quiet: true });
const llm = new GeminiLLM({ apiKeys: process.env.GEMINI_API_KEYS!.split(","), model: process.env.GEMINI_MODEL });
const e = Engram.init("money-ops", { dir: mkdtempSync(join(tmpdir(), "engram-m3-")), remote: new InMemoryRemote() });
const d = (s: string) => Date.parse(s);
const tx = (ts: string, data: object) => e.observe({ source: "tatum", ts: d(ts), data });
const context = "You are a money-ops agent watching one owner's Sui wallet 0xOWNER. Learn their financial habits so you can flag anomalies.";

tx("2026-07-01T09:02Z", { kind: "transfer_out", amount: 450, coin: "USDC", to: "0x7a11" });
tx("2026-07-25T08:00Z", { kind: "transfer_in", amount: 2100, coin: "USDC", from: "0xACME_PAYROLL" });
tx("2026-08-01T09:10Z", { kind: "transfer_out", amount: 450, coin: "USDC", to: "0x7a11" });
tx("2026-08-03T21:40Z", { kind: "swap", sell: "USDC", sellAmount: 100, buy: "SUI", via: "Cetus" });
tx("2026-08-25T08:01Z", { kind: "transfer_in", amount: 2100, coin: "USDC", from: "0xACME_PAYROLL" });
tx("2026-09-01T09:05Z", { kind: "transfer_out", amount: 450, coin: "USDC", to: "0x7a11" });
tx("2026-09-04T22:15Z", { kind: "swap", sell: "USDC", sellAmount: 100, buy: "SUI", via: "Cetus" });
e.observe({ source: "user", ts: d("2026-09-05T10:00Z"), data: { message: "The 450 to 0x7a11 is my rent. Don't alert me about it." } });
let t = Date.now();
const r1 = await e.sleep({ llm, context });
console.log(`\n== sleep 1 (${((Date.now() - t) / 1000).toFixed(1)}s) episodes=${r1.episodes} rejected=${JSON.stringify(r1.rejected)}`);
for (const b of e.beliefs()) console.log(`  ${b.id}@${b.version} ${b.confidence.toFixed(2)} [${b.tags}] ${b.statement}  (evidence ${b.evidence.length})`);

tx("2026-09-25T08:00Z", { kind: "transfer_in", amount: 2300, coin: "USDC", from: "0xACME_PAYROLL" });
tx("2026-10-01T09:03Z", { kind: "transfer_out", amount: 500, coin: "USDC", to: "0x7a11" });
e.observe({ source: "user", ts: d("2026-10-01T12:00Z"), data: { message: "Yes, rent went up to 500 from October. Also I got a raise." } });
tx("2026-10-02T03:12Z", { kind: "transfer_out", amount: 1800, coin: "USDC", to: "0xUNKNOWN99" });
t = Date.now();
const r2 = await e.sleep({ llm, context });
console.log(`\n== sleep 2 (${((Date.now() - t) / 1000).toFixed(1)}s) created=${r2.created.length} revised=${r2.revised.length} retracted=${r2.retracted.length} rejected=${JSON.stringify(r2.rejected)}`);
for (const b of [...r2.created, ...r2.revised, ...r2.retracted]) console.log(`  ${b.id}@${b.version} ${b.status} ${b.confidence.toFixed(2)} ${b.statement}\n     reason: ${b.reason}`);
console.log("\nrelevant('rent'):", (await e.relevant("rent payment")).map((b) => b.id));

/**
 * Live check of Move anchoring: one real commit (Walrus Memory) anchored with
 * engram_anchor on ENGRAM_ANCHOR_NETWORK, then verified, then a tampered copy rejected.
 *   npx tsx packages/sdk/scripts/live-anchor-check.ts [--local-storage]
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Engram, servicesFromEnv, checkMoveAnchor, GrpcEventReader, InMemoryRemote } from "../src/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
process.loadEnvFile(join(root, ".env"));
const s = servicesFromEnv();
if (s.anchorWarning) throw new Error(s.anchorWarning);
const e = Engram.init("live-anchor", { dir: mkdtempSync(join(tmpdir(), "engram-anchor-")), remote: process.argv.includes("--local-storage") ? new InMemoryRemote() : s.remote, anchorer: s.anchorer });
const ep = e.observe({ source: "user", data: { note: `anchor check ${new Date().toISOString()}` } });
e.applyOp({ op: "create", key: "anchor_check", statement: "Move anchoring works end to end", confidence: 0.9, evidence: [ep.id], tags: ["test"], reason: "live check" });
let t = Date.now();
const c = await e.commit("live anchor check");
console.log(`commit ${c.id.slice(0, 12)} in ${((Date.now() - t) / 1000).toFixed(0)}s, anchor:`, c.anchor);
t = Date.now();
const v = await e.verifyCommit(c.id);
for (const ch of v.checks) console.log(`  ${ch.ok ? "ok  " : "FAIL"} ${ch.name}: ${ch.detail}`);
console.log(`verify ${v.ok ? "PASSED" : "FAILED"} in ${((Date.now() - t) / 1000).toFixed(0)}s`);
if (c.anchor?.method === "move-event") {
  const forged = { ...c, manifest: { ...c.manifest, merkleRoot: "00".repeat(32) } };
  const r = await checkMoveAnchor(new GrpcEventReader(c.anchor.network ?? "mainnet"), c.anchor, forged);
  console.log(`tampered root -> ${r.ok ? "WRONGLY ACCEPTED" : "rejected: " + r.detail}`);
}
process.exit(v.ok ? 0 : 1);

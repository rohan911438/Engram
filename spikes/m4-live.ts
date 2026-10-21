// Live check for M4: commit → manifest on Walrus Memory → anchor found on Sui via Tatum.
import { config } from "dotenv";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Engram, TatumSui, WalrusBlobAnchorer, WalrusMemoryRemote, verifyManifestSignature } from "../packages/sdk/src/index.js";

config({ path: join(import.meta.dirname, "../.env"), quiet: true });
const env = process.env as Record<string, string>;
const remote = new WalrusMemoryRemote({ key: env.MEMWAL_KEY, accountId: env.MEMWAL_ACCOUNT_ID, serverUrl: env.MEMWAL_SERVER_URL });
const tatum = new TatumSui({ apiKey: env.TATUM_API_KEY_MAINNET });
const anchorer = new WalrusBlobAnchorer(tatum, env.MEMWAL_ACCOUNT_ID);
const e = Engram.init("spike", { dir: mkdtempSync(join(tmpdir(), "engram-m4-")), remote, anchorer });

const ep = e.observe({ source: "tatum", summary: "transfer 450 USDC", data: { amount: 450, to: "0x7a11" } });
e.applyOp({ op: "create", key: "rent", statement: "Owner pays 450 USDC rent to 0x7a11 monthly.", confidence: 0.6, evidence: [ep.id], tags: ["rent"], reason: "live test" });
let t = Date.now();
const c = await e.commit("live M4 test");
console.log(`commit ${c.id.slice(0, 12)} in ${((Date.now() - t) / 1000).toFixed(1)}s`);
console.log("  root     ", c.manifest.merkleRoot.slice(0, 16));
console.log("  signature", verifyManifestSignature(c.manifest, c.signature) ? "valid" : "INVALID");
console.log("  manifest blob", c.manifestBlobId);
console.log("  anchor   ", c.anchor ?? "NOT FOUND");
if (c.anchor?.timestampMs) console.log("  on-chain time", new Date(c.anchor.timestampMs).toISOString());
const hits = await remote.search(e.config.namespaces.commits, `Engram commit ${c.id}`, 5);
console.log("  recall manifest from Walrus:", hits.some((h) => h.blobId === c.manifestBlobId && h.text.includes(c.signature)) ? "found, text matches" : "not found");

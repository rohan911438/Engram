// Live check for M2: observe → push to Walrus Memory → blob visible on Sui via Tatum.
import { config } from "dotenv";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Engram, WalrusMemoryRemote } from "../packages/sdk/src/index.js";

config({ path: join(import.meta.dirname, "../.env") });
const env = (k: string) => process.env[k] ?? (() => { throw new Error(`missing ${k}`); })();

const remote = new WalrusMemoryRemote({ key: env("MEMWAL_KEY"), accountId: env("MEMWAL_ACCOUNT_ID"), serverUrl: env("MEMWAL_SERVER_URL") });
const dir = mkdtempSync(join(tmpdir(), "engram-live-"));
const e = Engram.init("spike", { dir, remote });
e.observe({ source: "tatum", summary: "transfer 450 USDC", data: { kind: "transfer", amount: 450, coin: "USDC", to: "0x7a", day: 1 } });
e.observe({ source: "user", summary: "owner note", data: { text: "yes, that's my rent" } });
let t = Date.now();
console.log("push:", await e.push(), `${((Date.now() - t) / 1000).toFixed(1)}s`);
const eps = e.episodes();
for (const ep of eps) console.log(ep.id, ep.blobId, "decrypts:", JSON.stringify(e.read(ep.id)?.data));

// find the matching Sui Blob objects through Tatum
const owner = "0xfe2cfd89573775b1f1bd2e0263373ab0d65bf91e081a7c3bc0e28941feed7b46";
const rpc = async (method: string, params: unknown[]) => {
  const r = await fetch("https://sui-mainnet.gateway.tatum.io", { method: "POST", headers: { "content-type": "application/json", "x-api-key": env("TATUM_API_KEY_MAINNET") }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return ((await r.json()) as any).result;
};
const toB64 = (u256: string) => { let x = BigInt(u256); const b = Buffer.alloc(32); for (let i = 0; i < 32; i++) { b[i] = Number(x & 0xffn); x >>= 8n; } return b.toString("base64url"); };
let cursor: string | null = null; const onChain = new Set<string>();
do {
  const page: any = await rpc("suix_getOwnedObjects", [owner, { filter: { StructType: "0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::blob::Blob" }, options: { showContent: true } }, cursor, 50]);
  for (const o of page.data) onChain.add(toB64(o.data.content.fields.blob_id));
  cursor = page.hasNextPage ? page.nextCursor : null;
} while (cursor);
for (const ep of eps) console.log(ep.id, "on Sui:", onChain.has(ep.blobId!));

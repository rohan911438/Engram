import { config } from "dotenv";
import { join } from "node:path";
import { MemWal } from "@mysten-incubation/memwal";
config({ path: join(import.meta.dirname, "../.env"), quiet: true });
const m = MemWal.create({ key: process.env.MEMWAL_KEY!, accountId: process.env.MEMWAL_ACCOUNT_ID!, serverUrl: process.env.MEMWAL_SERVER_URL });
const text = JSON.stringify({ engram: "commit-spike", root: "91c4ab", ts: Date.now() });
let t = Date.now();
const { vector } = await m.embed(text);
console.log("embed dims", vector.length, `${Date.now() - t}ms`);
t = Date.now();
const r = await m.rememberManual({ encryptedData: Buffer.from(text).toString("base64"), vector, namespace: "engram-spike-commits" });
console.log("manual:", r, `${((Date.now() - t) / 1000).toFixed(1)}s`);
for (let i = 0; i < 6; i++) {
  const res = await fetch(`https://aggregator.walrus-mainnet.walrus.space/v1/blobs/${r.blob_id}`);
  const body = await res.text();
  console.log("aggregator", res.status, body === text ? "EXACT MATCH" : body.slice(0, 80));
  if (res.ok) break;
  await new Promise((s) => setTimeout(s, 5000));
}

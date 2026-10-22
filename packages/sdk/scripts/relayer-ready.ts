/** Exits 0 when the Walrus Memory relayer answers a recall (its embedder works), else 1. */
import { MemWal } from "@mysten-incubation/memwal";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
process.loadEnvFile(join(resolve(dirname(fileURLToPath(import.meta.url)), "../../.."), ".env"));
const c = MemWal.create({ key: process.env.MEMWAL_KEY!, accountId: process.env.MEMWAL_ACCOUNT_ID!, serverUrl: process.env.MEMWAL_SERVER_URL });
try {
  await c.recall({ query: "rent", limit: 1, namespace: "engram-money-ops-beliefs" });
  console.log("relayer ready");
  process.exit(0);
} catch (e) {
  console.log("relayer not ready:", (e as Error).message.slice(0, 120));
  process.exit(1);
}

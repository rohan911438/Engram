/**
 * End-to-end check against a running server: wallet sign-in (real signature with
 * the .env wallet), tell, full run (sync → learn → commit), summary, verify HEAD.
 *   npx tsx apps/server/scripts/e2e.ts [http://localhost:8787]
 */
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
process.loadEnvFile(join(root, ".env"));
const base = process.argv[2] ?? "http://localhost:8787";
const kp = Ed25519Keypair.deriveKeypair(process.env.SUI_MNEMONIC!.trim());
let cookie = "";

async function call(path: string, json?: unknown) {
  const r = await fetch(base + path, {
    method: json === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", cookie },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  const sc = r.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const body = await r.json();
  if (r.status >= 400) throw new Error(`${path} → ${r.status} ${JSON.stringify(body)}`);
  return body;
}
const step = (s: string) => console.log(`\n▶ ${s}`);

step("sign in");
const ch = await call("/api/auth/challenge", { address: kp.toSuiAddress() });
const { signature } = await kp.signPersonalMessage(new TextEncoder().encode(ch.message));
await call("/api/auth/verify", { nonce: ch.nonce, signature });
console.log((await call("/api/me/whoami")));

step("tell");
console.log(await call("/api/me/tell", { message: `My rent is 450 USDC, paid on the 1st of each month (${new Date().toISOString()})` }));

step("run (sync → learn → commit)");
const { job } = await call("/api/me/run", {});
let j = job, printed = 0;
const t0 = Date.now();
while (j.status === "running" && Date.now() - t0 < 600_000) {
  await new Promise((r) => setTimeout(r, 3000));
  j = await call(`/api/me/jobs/${job.id}`);
  for (const line of j.log.slice(printed)) console.log("  " + line.text);
  printed = j.log.length;
}
console.log(`job ${j.status} in ${((Date.now() - t0) / 1000).toFixed(0)}s`, j.error ?? "", JSON.stringify(j.result ?? {}).slice(0, 300));

step("summary");
console.log(JSON.stringify(await call("/api/me/summary")).slice(0, 600));

step("verify HEAD");
try {
  const v = await call("/api/me/verify/HEAD");
  for (const c of v.checks ?? []) console.log(`  ${c.ok ? "ok  " : "FAIL"} ${c.name}: ${c.detail}`);
  console.log(v.ok ? "VERIFY PASSED" : "VERIFY FAILED");
} catch (e) {
  console.log("verify:", (e as Error).message);
}

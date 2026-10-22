/**
 * Publishes the engram_anchor Move package with the wallet in `.env` (SUI_MNEMONIC).
 *
 *   npx tsx packages/sdk/scripts/publish-anchor.ts [testnet|mainnet]
 *
 * Prints the package ID to put in `.env` as ENGRAM_ANCHOR_PACKAGE
 * (and ENGRAM_ANCHOR_NETWORK=testnet when publishing to testnet).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const pkgDir = join(root, "contracts/engram_anchor");
const network = (process.argv[2] ?? "testnet") as "testnet" | "mainnet";
if (network !== "testnet" && network !== "mainnet") throw new Error("network must be testnet or mainnet");
if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));

const phrase = process.env.SUI_MNEMONIC?.trim();
if (!phrase) throw new Error("SUI_MNEMONIC is not set in .env");
let keypair: Ed25519Keypair;
try {
  keypair = Ed25519Keypair.deriveKeypair(phrase);
} catch {
  const words = phrase.split(/\s+/);
  const { wordlist } = await import("@scure/bip39/wordlists/english.js");
  const unknown = words.map((w, i) => (wordlist.includes(w) ? 0 : i + 1)).filter(Boolean);
  throw new Error(
    `SUI_MNEMONIC is not a valid phrase: ${words.length} words` +
      (unknown.length ? `, unknown word(s) at position ${unknown.join(", ")}` : ", all words known (checksum fails — wrong word or order)"),
  );
}
const sender = keypair.toSuiAddress();

const out = execFileSync("sui", ["move", "build", "--dump-bytecode-as-base64", "--path", pkgDir], { encoding: "utf8" });
const { modules, dependencies } = JSON.parse(out.trim().split("\n").pop()!) as { modules: string[]; dependencies: string[] };

const client = new SuiGrpcClient({ network, baseUrl: `https://fullnode.${network}.sui.io:443` });
const { balance } = await client.getBalance({ owner: sender });
console.log(`publishing to ${network} from ${sender} (balance ${Number(balance.balance) / 1e9} SUI)`);

const tx = new Transaction();
const [cap] = tx.publish({ modules, dependencies });
tx.transferObjects([cap], sender);
const res = await client.signAndExecuteTransaction({ transaction: tx, signer: keypair, include: { effects: true, objectTypes: true } });
if (res.$kind !== "Transaction") throw new Error(`publish failed: ${JSON.stringify(res.FailedTransaction?.status)}`);
await client.waitForTransaction({ digest: res.Transaction.digest });

const created = res.Transaction.effects?.changedObjects.filter((o) => o.idOperation === "Created") ?? [];
const pkg = created.find((o) => res.Transaction.objectTypes?.[o.objectId] === "package");
console.log(`tx       ${res.Transaction.digest}`);
console.log(`package  ${pkg?.objectId ?? "(not found — check the tx)"}`);
console.log(`\nAdd to .env:\nENGRAM_ANCHOR_PACKAGE=${pkg?.objectId}\nENGRAM_ANCHOR_NETWORK=${network}`);

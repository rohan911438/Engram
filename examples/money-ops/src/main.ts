import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { config } from "dotenv";
import pc from "picocolors";
import { Engram, FakeAnchorer, InMemoryRemote, NothingToCommitError, servicesFromEnv, type LLM } from "@engram/sdk";
import { CONTEXT, MoneyOpsAgent, type Handled } from "./agent.js";
import { describe, WalletFeed, type WalletEvent } from "./feed.js";
import { SCENARIO } from "./scenario.js";

const HELP = `money-ops — a wallet-watching agent with provable memory (Engram)

  replay [--dir <path>] [--offline]   run the 4-month demo story
  watch <0xaddress> [--dir <path>] [--every <sec>] [--commit-every <n>]
                                      watch a real Sui wallet via Tatum

Keys come from ../../.env (or --env <file>).`;

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? "") : undefined;
};
const has = (name: string) => args.includes(`--${name}`);
config({ path: resolve(flag("env") ?? join(import.meta.dirname, "../../../.env")), quiet: true });

const sev = { info: pc.cyan, warn: pc.yellow, critical: (s: string) => pc.bgRed(pc.white(s)) };

function print(h: Handled) {
  const date = new Date(h.event.ts).toISOString().slice(0, 10);
  const head = `${pc.dim(date)} ${describe(h.event).padEnd(36)}`;
  if (h.assessment.alert) console.log(`${head} ${sev[h.assessment.severity](`🔔 ${h.assessment.severity.toUpperCase()}`)} ${h.assessment.message}`);
  else console.log(`${head} ${pc.green("✓ quiet")} ${pc.dim(h.assessment.message)}`);
  if (h.receipt) console.log(pc.dim(`${" ".repeat(11)}receipt ${h.receipt.id} · beliefs [${h.receipt.beliefs.join(", ") || "none"}] · commit ${h.receipt.commitId.slice(0, 8)}`));
}

function openRepo(dir: string, offline: boolean) {
  const s = servicesFromEnv();
  const remote = offline ? new InMemoryRemote() : s.remote;
  const anchorer = offline ? new FakeAnchorer() : s.anchorer;
  const opts = { dir, remote, anchorer };
  const engram = existsSync(join(dir, ".engram", "config.json")) ? Engram.open(opts) : Engram.init("money-ops", opts);
  return { engram, llm: s.llm(), tatum: s.tatum };
}

async function sleepAndCommit(engram: Engram, llm: LLM, label: string) {
  const r = await engram.sleep({ llm, context: CONTEXT });
  console.log(pc.bold(`\n💤 sleep — ${r.episodes} episodes → ${r.created.length} new, ${r.revised.length} revised, ${r.retracted.length} retracted beliefs`));
  for (const b of r.created) console.log(pc.green(`   + ${b.id} (${b.confidence.toFixed(2)}) ${b.statement}`));
  for (const b of r.revised) console.log(pc.yellow(`   ~ ${b.id}@${b.version} (${b.confidence.toFixed(2)}) ${b.statement}`));
  for (const b of r.retracted) console.log(pc.red(`   - ${b.id} ${b.reason ?? ""}`));
  try {
    const c = await engram.commit(label);
    console.log(pc.bold(`📌 commit ${c.id.slice(0, 8)} "${label}" — ${c.manifest.beliefs.length} beliefs`) + pc.dim(c.anchor ? ` · anchored on Sui, checkpoint ${c.anchor.checkpoint}` : " · not anchored yet"));
  } catch (err) {
    if (!(err instanceof NothingToCommitError)) throw err;
    console.log(pc.dim("   (no belief changes to commit)"));
  }
  console.log();
}

async function replay() {
  const dir = resolve(flag("dir") ?? "./money-ops-demo");
  mkdirSync(dir, { recursive: true });
  const { engram, llm } = openRepo(dir, has("offline"));
  if (engram.episodes().length) throw new Error(`${dir} already has a history — use a fresh --dir`);
  const agent = new MoneyOpsAgent(engram, llm);
  console.log(pc.bold(`money-ops replay → ${dir}${has("offline") ? " (offline)" : " (Walrus Memory + Sui via Tatum)"}\n`));
  const phase: { label: string; txs: number; alerts: number }[] = [];
  let cur = { label: "", txs: 0, alerts: 0 };
  // Consecutive transactions are judged together (one LLM call per batch).
  let batch: WalletEvent[] = [];
  const flush = async () => {
    for (const h of await agent.handleMany(batch)) {
      print(h);
      cur.txs++;
      if (h.assessment.alert) cur.alerts++;
    }
    batch = [];
  };
  for (const step of SCENARIO) {
    if (step.type === "tx") {
      batch.push(step.event);
      continue;
    }
    await flush();
    if (step.type === "owner") {
      agent.ownerSays(step.message, step.ts);
      console.log(`${pc.dim(new Date(step.ts).toISOString().slice(0, 10))} ${pc.magenta("💬 owner:")} ${step.message}`);
    } else {
      phase.push({ ...cur, label: step.label });
      cur = { label: "", txs: 0, alerts: 0 };
      await sleepAndCommit(engram, llm, step.label);
    }
  }
  await flush();
  phase.push({ ...cur, label: "November: applying what it learned" });
  await engram.push();

  console.log(pc.bold("\nHow the agent changed"));
  for (const p of phase) console.log(`  ${p.label.padEnd(42)} ${p.alerts}/${p.txs} events alerted`);
  console.log(pc.dim(`\nTry:  engram -C ${dir} log   ·   engram -C ${dir} blame <belief>   ·   engram -C ${dir} verify ${engram.receipts().at(-1)?.id ?? "HEAD"}`));
}

async function watch() {
  const address = args[1];
  if (!address?.startsWith("0x")) throw new Error("usage: watch <0xaddress>");
  const dir = resolve(flag("dir") ?? "./money-ops-live");
  mkdirSync(dir, { recursive: true });
  const { engram, llm, tatum } = openRepo(dir, false);
  if (!tatum) throw new Error("watch needs TATUM_API_KEY in .env");
  const agent = new MoneyOpsAgent(engram, llm);
  const feed = new WalletFeed(tatum, address);
  const statePath = join(dir, "money-ops.state.json");
  const seen = new Set<string>(existsSync(statePath) ? (JSON.parse(readFileSync(statePath, "utf8")) as string[]) : []);
  const every = Number(flag("every") ?? 60) * 1000;
  const commitEvery = Number(flag("commit-every") ?? 10);
  let sinceCommit = 0;
  console.log(pc.bold(`money-ops watching ${address} via Tatum Sui RPC — every ${every / 1000}s\n`));
  for (;;) {
    const events = await feed.fetch(seen);
    for (const h of await agent.handleMany(events)) {
      print(h);
      seen.add(h.event.digest);
      sinceCommit++;
    }
    writeFileSync(statePath, JSON.stringify([...seen]));
    if (sinceCommit >= commitEvery) {
      await sleepAndCommit(engram, llm, `live: ${sinceCommit} new wallet events`);
      sinceCommit = 0;
    }
    if (has("once")) {
      if (sinceCommit > 0) await sleepAndCommit(engram, llm, `live: ${sinceCommit} new wallet events`);
      break;
    }
    await new Promise((r) => setTimeout(r, every));
  }
}

const cmd = args[0];
try {
  if (cmd === "replay") await replay();
  else if (cmd === "watch") await watch();
  else console.log(HELP);
} catch (err) {
  console.error(pc.red(`error: ${(err as Error).message}`));
  process.exitCode = 1;
}

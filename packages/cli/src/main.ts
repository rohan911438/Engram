#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { config as loadEnv } from "dotenv";
import pc from "picocolors";
import { Engram, NothingToCommitError, beliefKey, servicesFromEnv, type Belief, type EpisodeSource, type VerifyReport } from "@engram/sdk";

const program = new Command();
program
  .name("engram")
  .description("Git for agent memory — versioned, provable memory on Walrus Memory")
  .version("0.1.0")
  .option("-C, --dir <path>", "project folder containing .engram/", ".")
  .option("--env <file>", "env file with keys", ".env");

function services() {
  const o = program.opts<{ dir: string; env: string }>();
  const envPath = resolve(o.env);
  if (existsSync(envPath)) loadEnv({ path: envPath, quiet: true });
  return { dir: o.dir, ...servicesFromEnv() };
}

function open(): Engram {
  const s = services();
  return Engram.open({ dir: s.dir, remote: s.remote, anchorer: s.anchorer });
}

// ---- formatting ------------------------------------------------------------

const short = (id: string) => id.slice(0, 8);
const when = (ts: number) => new Date(ts).toISOString().replace("T", " ").slice(0, 16);
const conf = (c: number) => {
  const s = c.toFixed(2);
  return c >= 0.8 ? pc.green(s) : c >= 0.5 ? pc.yellow(s) : pc.red(s);
};
const ok = (s: string) => console.log(`${pc.green("✔")} ${s}`);
const info = (s: string) => console.log(pc.dim(s));

function printBelief(b: Belief, prefix = "") {
  const status = b.status === "retracted" ? pc.red(" [retracted]") : "";
  console.log(`${prefix}${pc.cyan(beliefKey(b).padEnd(26))} ${conf(b.confidence)}  ${b.statement}${status}`);
}

function printReport(title: string, r: VerifyReport) {
  console.log(`\n${pc.bold(title)}`);
  for (const c of r.checks) {
    const mark = c.skipped ? pc.dim("–") : c.ok ? pc.green("✔") : pc.red("✘");
    console.log(`  ${mark} ${c.name.padEnd(22)} ${c.skipped ? pc.dim(c.detail) : c.detail}`);
  }
  console.log(r.ok ? pc.green(pc.bold("\nVALID")) + pc.dim(" — this memory is exactly what was committed, signed and anchored.") : pc.red(pc.bold("\nINVALID")));
  if (!r.ok) process.exitCode = 1;
}

/** Wraps a command so errors print cleanly instead of a stack trace. */
function run<A extends unknown[]>(fn: (...args: A) => unknown | Promise<unknown>) {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (err) {
      console.error(pc.red(`error: ${(err as Error).message}`));
      if (process.env.ENGRAM_DEBUG) console.error(err);
      process.exitCode = 1;
    }
  };
}

// ---- commands --------------------------------------------------------------

program
  .command("init <agent>")
  .description("create .engram/ with a new agent signing key and key vault")
  .action(run(async (agent: string) => {
    const s = services();
    const e = Engram.init(agent, { dir: s.dir, remote: s.remote, anchorer: s.anchorer });
    ok(`Engram repo created at ${e.store.root}`);
    ok(`Agent key (Ed25519) ${pc.cyan(e.publicKey.slice(0, 16))}…`);
    ok(`Walrus Memory namespaces: ${Object.values(e.config.namespaces).join(", ")}`);
    if (s.tatum) {
      try {
        ok(`Tatum Sui RPC reachable — checkpoint ${Number(await s.tatum.latestCheckpoint()).toLocaleString("en-US")}`);
      } catch (err) {
        console.log(pc.yellow(`! Tatum Sui RPC not reachable: ${(err as Error).message}`));
      }
    } else console.log(pc.yellow("! No TATUM_API_KEY — commits won't be anchored"));
    info("\nKeep .engram/agent.key and .engram/master.key secret (add .engram/ to .gitignore).");
  }));

program
  .command("status")
  .description("current commit, counts and uncommitted changes")
  .action(run(() => {
    const e = open();
    const head = e.head();
    const eps = e.episodes();
    console.log(`agent      ${pc.bold(e.agent)}`);
    console.log(`HEAD       ${head ? pc.yellow(short(head)) + " " + e.getCommit(head)!.manifest.message : pc.dim("(no commits yet)")}`);
    console.log(`episodes   ${eps.length} (${e.pendingEpisodes().length} not consolidated, ${eps.filter((x) => !x.blobId && !x.forgottenAt).length} not pushed, ${eps.filter((x) => x.forgottenAt).length} forgotten)`);
    console.log(`beliefs    ${e.beliefs().length} active, ${e.beliefVersions().length} versions`);
    console.log(`receipts   ${e.receipts().length}`);
    if (head) {
      const d = e.diff("HEAD");
      const n = d.added.length + d.changed.length + d.removed.length;
      const tomb = e.tombstones().length - e.getCommit(head)!.manifest.tombstones.length;
      if (n || tomb) console.log(pc.yellow(`\nuncommitted: +${d.added.length} ~${d.changed.length} -${d.removed.length} beliefs${tomb ? `, ${tomb} new tombstone(s)` : ""} — run \`engram commit\``));
      else console.log(pc.dim("\nnothing to commit"));
    }
  }));

program
  .command("observe [data...]")
  .description("record an episode (JSON or text), encrypted with its own key")
  .option("-s, --source <source>", "user | tool | tatum | agent | system", "user")
  .option("-m, --summary <text>", "short non-sensitive label for logs")
  .option("-f, --file <path>", "read the data from a JSON file")
  .action(run((data: string[], o: { source: EpisodeSource; summary?: string; file?: string }) => {
    const raw = o.file ? readFileSync(o.file, "utf8") : data.join(" ");
    if (!raw.trim()) throw new Error("nothing to observe — pass text, JSON or --file");
    let value: unknown = raw;
    try {
      value = JSON.parse(raw);
    } catch {
      /* plain text */
    }
    const ep = open().observe({ source: o.source, data: value, summary: o.summary });
    ok(`episode ${pc.cyan(ep.id)} recorded (encrypted, key ${ep.keyId})`);
  }));

program
  .command("sleep")
  .description("consolidate new episodes into beliefs with the LLM")
  .option("-c, --context <text>", "domain hint for the consolidator")
  .option("-v, --verbose", "show rejected suggestions")
  .action(run(async (o: { context?: string; verbose?: boolean }) => {
    const s = services();
    const e = Engram.open({ dir: s.dir, remote: s.remote, anchorer: s.anchorer });
    const n = e.pendingEpisodes().length;
    if (n === 0) return info("no new episodes to consolidate");
    info(`consolidating ${n} episode(s)…`);
    const r = await e.sleep({ llm: s.llm(), context: o.context });
    ok(`Consolidated ${r.episodes} episodes → ${r.created.length} new, ${r.revised.length} revised, ${r.retracted.length} retracted`);
    for (const b of r.created) printBelief(b, pc.green("  + "));
    for (const b of r.revised) printBelief(b, pc.yellow("  ~ "));
    for (const b of r.retracted) printBelief(b, pc.red("  - "));
    if (r.rejected.length) {
      console.log(pc.dim(`  (${r.rejected.length} ungrounded suggestion(s) rejected${o.verbose ? "" : " — use -v to see why"})`));
      if (o.verbose) for (const x of r.rejected) console.log(pc.dim(`    ${x.why}: ${JSON.stringify(x.op)}`));
    }
  }));

program
  .command("commit")
  .description("snapshot beliefs: Merkle root + signature → Walrus → Sui anchor")
  .requiredOption("-m, --message <text>", "commit message")
  .option("--allow-empty", "commit even if nothing changed")
  .action(run(async (o: { message: string; allowEmpty?: boolean }) => {
    const e = open();
    info("pushing to Walrus Memory and anchoring (this takes ~30–60 s)…");
    try {
      const c = await e.commit(o.message, { allowEmpty: o.allowEmpty });
      ok(`commit ${pc.yellow(short(c.id))}  root ${c.manifest.merkleRoot.slice(0, 10)}…  ${c.manifest.beliefs.length} beliefs`);
      ok(`manifest on Walrus  blob ${c.manifestBlobId}`);
      if (c.anchor) ok(`anchored on Sui (tx ${c.anchor.txDigest.slice(0, 10)}…, checkpoint ${Number(c.anchor.checkpoint).toLocaleString("en-US")})`);
      else console.log(pc.yellow("! anchor not found yet — run `engram anchor` in a minute"));
    } catch (err) {
      if (err instanceof NothingToCommitError) return info(err.message);
      throw err;
    }
  }));

program
  .command("anchor [commit]")
  .description("retry finding the Sui anchor of a commit")
  .action(run(async (ref?: string) => {
    const e = open();
    const c = await e.anchor(e.resolve(ref ?? "HEAD"));
    if (c.anchor) ok(`commit ${short(c.id)} anchored: tx ${c.anchor.txDigest}`);
    else console.log(pc.yellow("anchor still not visible"));
  }));

program
  .command("push")
  .description("upload pending episodes, beliefs and receipts to Walrus Memory")
  .action(run(async () => {
    const r = await open().push();
    ok(`pushed ${r.episodes} episodes, ${r.beliefs} belief versions, ${r.receipts} receipts`);
  }));

program
  .command("log")
  .description("commit history")
  .option("-n, --max <n>", "max commits", "20")
  .action(run((o: { max: string }) => {
    const e = open();
    const commits = e.log().slice(0, Number(o.max));
    if (commits.length === 0) return info("no commits yet");
    commits.forEach((c, i) => {
      const parent = c.manifest.parent;
      let delta = "";
      if (parent) {
        const d = e.diff(parent, c.id);
        delta = pc.dim(` (+${d.added.length} ~${d.changed.length} -${d.removed.length})`);
      }
      console.log(`${pc.yellow(short(c.id))} ${pc.dim(when(c.manifest.ts))} ${i === 0 ? pc.cyan("(HEAD) ") : ""}${c.manifest.message}${delta}`);
      console.log(pc.dim(`         ${c.manifest.beliefs.length} beliefs · ${c.manifest.tombstones.length} tombstones · ${c.anchor ? `Sui tx ${c.anchor.txDigest.slice(0, 10)}…` : "not anchored"}`));
    });
  }));

program
  .command("diff <from> [to]")
  .description("beliefs added / changed / removed between commits (or vs. working beliefs)")
  .action(run((from: string, to?: string) => {
    const d = open().diff(from, to);
    if (!d.added.length && !d.changed.length && !d.removed.length) return info("no differences");
    for (const b of d.added) printBelief(b, pc.green("+ "));
    for (const [a, b] of d.changed) {
      console.log(`${pc.yellow("~")} ${pc.cyan(b.id)}  v${a.version} → v${b.version}`);
      if (a.statement !== b.statement) {
        console.log(pc.red(`    - ${a.statement}`));
        console.log(pc.green(`    + ${b.statement}`));
      }
      if (a.confidence !== b.confidence) console.log(`    confidence ${conf(a.confidence)} → ${conf(b.confidence)}`);
      if (b.reason) console.log(pc.dim(`    why: ${b.reason}`));
    }
    for (const b of d.removed) printBelief(b, pc.red("- "));
  }));

program
  .command("beliefs")
  .description("current beliefs (or the ones relevant to --about)")
  .option("-a, --about <query>", "only beliefs relevant to this")
  .option("--all", "include retracted beliefs")
  .action(run(async (o: { about?: string; all?: boolean }) => {
    const e = open();
    const list = o.about ? await e.relevant(o.about, 10) : o.all ? e.latestBeliefs() : e.beliefs();
    if (list.length === 0) return info("no beliefs");
    for (const b of list) printBelief(b);
  }));

program
  .command("checkout <ref>")
  .description("show the beliefs the agent had at a commit or date (time travel)")
  .action(run((ref: string) => {
    const e = open();
    const c = e.getCommit(e.resolve(ref))!;
    console.log(`${pc.bold("memory at")} ${pc.yellow(short(c.id))} ${pc.dim(when(c.manifest.ts))} ${c.manifest.message}\n`);
    for (const b of e.beliefsAt(c.id)) printBelief(b);
  }));

program
  .command("blame <belief>")
  .description("the episodes (with Walrus blob IDs) behind a belief")
  .action(run((ref: string) => {
    const { belief, history, evidence } = open().blame(ref);
    printBelief(belief);
    if (belief.reason) console.log(pc.dim(`  why: ${belief.reason}`));
    for (const ep of evidence) {
      const data = ep.content ? JSON.stringify(ep.content.data) : pc.red("[forgotten — key destroyed]");
      console.log(`  ← ${pc.cyan(ep.episode.id)}  ${pc.dim(when(ep.episode.ts))}  ${ep.episode.source}: ${data.length > 90 ? data.slice(0, 90) + "…" : data}`);
      console.log(pc.dim(`      blob ${ep.episode.blobId ?? "(not pushed)"}`));
    }
    if (history.length > 1) {
      console.log(pc.bold("\nhistory"));
      for (const h of history) console.log(`  v${h.version} ${pc.dim(when(h.createdAt))} ${conf(h.confidence)} ${h.statement}${h.reason ? pc.dim(` — ${h.reason}`) : ""}`);
    }
  }));

program
  .command("receipts")
  .description("decision receipts")
  .action(run(() => {
    const rs = open().receipts();
    if (rs.length === 0) return info("no receipts yet");
    for (const r of rs) console.log(`${pc.magenta(r.id)} ${pc.dim(when(r.ts))} ${r.action} ${pc.dim(`[${r.beliefs.join(", ")}] @ ${short(r.commitId)}`)}`);
  }));

program
  .command("verify [ref]")
  .description("verify a receipt (r_…) or commit: signatures, proofs, Walrus, Sui via Tatum")
  .option("--offline", "skip Walrus and Sui checks")
  .action(run(async (ref = "HEAD", o: { offline?: boolean }) => {
    const e = open();
    const opts = o.offline ? { walrus: false, chain: false } : {};
    if (ref.startsWith("r_")) printReport(`receipt ${ref}`, await e.verifyReceipt(ref, opts));
    else printReport(`commit ${short(e.resolve(ref))}`, await e.verifyCommit(ref, opts));
  }));

program
  .command("forget <episode>")
  .description("crypto-shred an episode: destroy its key, retract dependent beliefs")
  .option("-r, --reason <text>", "why", "forgotten on request")
  .action(run((id: string, o: { reason: string }) => {
    const r = open().forget(id, o.reason);
    ok(`key for ${pc.cyan(id)} destroyed — the episode can never be decrypted again`);
    for (const b of r.retracted) printBelief(b, pc.red("  - "));
    for (const b of r.revised) printBelief(b, pc.yellow("  ~ "));
    info("run `engram commit` to record the tombstone on Walrus + Sui");
  }));

await program.parseAsync();

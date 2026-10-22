import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Engram, FakeAnchorer, InMemoryRemote } from "@rohankumar4179/engram-sdk";

/**
 * Runs the real CLI (src/main.ts through tsx) as a child process against a repo
 * prepared with in-memory storage. No keys: network-dependent checks must be
 * skipped or fail cleanly, never crash.
 */
const main = resolve(import.meta.dirname, "main.ts");
const exec = promisify(execFile);
let dir: string;
let noEnv: string;
let receiptId: string;
let firstEpisode: string;

async function cli(...args: string[]): Promise<{ code: number; out: string }> {
  try {
    const r = await exec(process.execPath, ["--import", "tsx", main, "-C", dir, "--env", noEnv, ...args], { env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" }, timeout: 60_000 });
    return { code: 0, out: r.stdout + r.stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "engram-cli-"));
  noEnv = join(dir, "missing.env");
  const e = Engram.init("cli-test", { dir, remote: new InMemoryRemote(), anchorer: new FakeAnchorer() });
  const a = e.observe({ source: "user", summary: "rent", data: "My rent is 450 USDC on the 1st" });
  firstEpisode = a.id;
  e.applyOp({ op: "create", key: "rent", statement: "Rent is 450 USDC on the 1st.", confidence: 0.8, evidence: [a.id], tags: ["rent"], reason: "owner said so" });
  await e.commit("first");
  const b = e.observe({ source: "user", summary: "raise", data: "Rent is 500 from October" });
  e.applyOp({ op: "revise", belief: "b_rent", statement: "Rent is 500 USDC on the 1st.", confidence: 0.9, evidence: [a.id, b.id], reason: "raise" });
  await e.commit("rent raise");
  receiptId = e.decide({ action: "no alert: rent", input: 1, beliefs: ["b_rent"] }).id;
}, 60_000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("engram CLI", { timeout: 60_000 }, () => {
  it("status, log, beliefs", async () => {
    expect((await cli("status")).out).toMatch(/cli-test/);
    const log = await cli("log");
    expect(log.out).toMatch(/rent raise/);
    expect(log.out).toMatch(/first/);
    expect((await cli("beliefs")).out).toMatch(/b_rent@2 .*500 USDC/);
  });

  it("diff, checkout, blame", async () => {
    const d = await cli("diff", "HEAD~1", "HEAD");
    expect(d.out).toMatch(/500 USDC/);
    expect((await cli("checkout", "HEAD~1")).out).toMatch(/450 USDC/);
    const b = await cli("blame", "b_rent");
    expect(b.out).toMatch(new RegExp(firstEpisode));
    expect(b.out).toMatch(/raise/);
  });

  it("verify --offline for a commit and a receipt", async () => {
    const c = await cli("verify", "HEAD", "--offline");
    expect(c.code).toBe(0);
    expect(c.out).toMatch(/VALID/);
    const r = await cli("verify", receiptId, "--offline");
    expect(r.out).toMatch(/belief proofs/);
    expect(r.code).toBe(0);
  });

  it("export --audit and audit --offline; a tampered bundle fails", async () => {
    const out = join(dir, "audit.json");
    expect((await cli("export", "--audit", "-o", out)).code).toBe(0);
    expect(existsSync(out)).toBe(true);
    const good = await cli("audit", out, "--offline");
    expect(good.code).toBe(0);
    expect(good.out).toMatch(/VALID/);
    const bundle = JSON.parse(readFileSync(out, "utf8"));
    bundle.beliefs[0].confidence = 0.1;
    writeFileSync(out, JSON.stringify(bundle));
    const bad = await cli("audit", out, "--offline");
    expect(bad.code).toBe(1);
    expect(bad.out).toMatch(/INVALID/);
  });

  it("fails cleanly (no stack trace) on bad input", async () => {
    const r = await cli("blame", "b_nope");
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^error: /m);
    expect(r.out).not.toMatch(/\n\s+at /);
  });
});

describe("engram mcp", () => {
  it("serves Engram tools over stdio to an MCP client", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", main, "-C", dir, "--env", noEnv, "mcp"],
      env: { ...(process.env as Record<string, string>), NO_COLOR: "1" },
      stderr: "pipe",
    });
    const client = new Client({ name: "test", version: "0" });
    await client.connect(transport);
    try {
      const tools = (await client.listTools()).tools.map((t) => t.name).sort();
      expect(tools).toEqual(["engram_beliefs", "engram_blame", "engram_commit", "engram_diff", "engram_forget", "engram_log", "engram_remember", "engram_sleep", "engram_status", "engram_verify"]);
      const call = async (name: string, args: Record<string, unknown> = {}) => {
        const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
        return { text: r.content.map((c) => c.text).join("\n"), isError: !!r.isError };
      };
      expect((await call("engram_status")).text).toMatch(/HEAD [0-9a-f]{8} "rent raise"/);
      expect((await call("engram_beliefs", { about: "rent" })).text).toMatch(/b_rent@2/);
      expect((await call("engram_beliefs", { at: "HEAD~1" })).text).toMatch(/450 USDC/);
      expect((await call("engram_blame", { belief: "b_rent" })).text).toMatch(/versions: v1 → v2/);
      expect((await call("engram_diff", { from: "HEAD~1" })).text).toMatch(/~ Rent is 450/);
      expect((await call("engram_verify", { ref: "HEAD", offline: true })).text).toMatch(/VALID/);
      const rem = await call("engram_remember", { text: "I moved to a new flat" });
      expect(rem.text).toMatch(/recorded ep_/);
      expect((await call("engram_status")).text).toMatch(/3 episodes/);
      // Without keys, tools that need the network fail as tool errors, not crashes.
      const s = await call("engram_sleep");
      expect(s.isError).toBe(true);
      expect(s.text).toMatch(/error: .*LLM/);
      expect((await call("engram_forget", { episode: "not-an-id" })).isError).toBe(true);
    } finally {
      await client.close();
    }
  }, 60_000);
});

import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Engram, FakeAnchorer, InMemoryRemote, ScriptedLLM } from "@engram/sdk";
import { createApp } from "./app.js";
import { Tenant, Tenants, agentName } from "./tenants.js";

let dir: string;
let base: string;
let stop: () => void;
const services = { remote: new InMemoryRemote(), anchorer: new FakeAnchorer(), llm: () => new ScriptedLLM([{ ops: [] }]) };

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "engram-server-"));
  // a small read-only demo repo
  const demoDir = join(dir, "demo");
  const e = Engram.init("demo-agent", { dir: demoDir, ...services });
  const ep = e.observe({ source: "user", data: "hi" });
  e.applyOp({ op: "create", key: "x", statement: "X.", confidence: 0.8, evidence: [ep.id], tags: ["x"], reason: "t" });
  await e.commit("demo");
  const server = createApp({ tenants: new Tenants(join(dir, "data"), services), demo: new Tenant("demo", demoDir, services, true), staticDir: null });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  stop = () => server.close();
});
afterAll(() => {
  stop();
  rmSync(dir, { recursive: true, force: true });
});

const call = async (path: string, init: RequestInit & { json?: unknown; cookie?: string } = {}) => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.cookie) headers.cookie = init.cookie;
  const r = await fetch(base + path, { method: init.json !== undefined ? "POST" : init.method, headers, body: init.json !== undefined ? JSON.stringify(init.json) : undefined });
  return { status: r.status, body: await r.json(), setCookie: r.headers.get("set-cookie") };
};

async function signIn(kp: Ed25519Keypair) {
  const address = kp.toSuiAddress();
  const ch = await call("/api/auth/challenge", { json: { address } });
  const { signature } = await kp.signPersonalMessage(new TextEncoder().encode(ch.body.message));
  return { ch, res: await call("/api/auth/verify", { json: { nonce: ch.body.nonce, signature } }) };
}

describe("wallet sign-in", () => {
  it("signs in with a valid wallet signature and sets a session cookie", async () => {
    const kp = new Ed25519Keypair();
    const { ch, res } = await signIn(kp);
    expect(ch.body.message).toContain(kp.toSuiAddress());
    expect(ch.body.message).toContain("moves no funds");
    expect(res.status).toBe(200);
    expect(res.setCookie).toMatch(/engram_session=.+HttpOnly/);
    const cookie = res.setCookie!.split(";")[0]!;
    expect((await call("/api/auth/me", { cookie })).body.address).toBe(kp.toSuiAddress());
    const me = await call("/api/me/whoami", { cookie });
    expect(me.body.agent).toBe(agentName(kp.toSuiAddress()));
  });

  it("rejects a signature from a different wallet, and reused nonces", async () => {
    const victim = new Ed25519Keypair();
    const attacker = new Ed25519Keypair();
    const ch = await call("/api/auth/challenge", { json: { address: victim.toSuiAddress() } });
    const { signature } = await attacker.signPersonalMessage(new TextEncoder().encode(ch.body.message));
    const bad = await call("/api/auth/verify", { json: { nonce: ch.body.nonce, signature } });
    expect(bad.status).toBe(400);
    const { signature: good } = await victim.signPersonalMessage(new TextEncoder().encode(ch.body.message));
    expect((await call("/api/auth/verify", { json: { nonce: ch.body.nonce, signature: good } })).status).toBe(400); // nonce burned
  });

  it("requires a session for /api/me and rejects bad addresses", async () => {
    expect((await call("/api/me/summary")).status).toBe(401);
    expect((await call("/api/auth/challenge", { json: { address: "not-an-address" } })).status).toBe(400);
  });
});

describe("agents", () => {
  it("serves the demo read-only", async () => {
    expect((await call("/api/demo/summary")).body.counts.beliefs).toBe(1);
    expect((await call("/api/demo/verify/HEAD")).body.ok).toBe(true);
    expect((await call("/api/demo/tell", { json: { message: "x" } })).status).toBe(403);
  });

  it("gives each wallet its own agent that the owner can talk to and forget from", async () => {
    const a = (await signIn(new Ed25519Keypair())).res.setCookie!.split(";")[0]!;
    const b = (await signIn(new Ed25519Keypair())).res.setCookie!.split(";")[0]!;
    const told = await call("/api/me/tell", { json: { message: "My rent is 450 USDC on the 1st" }, cookie: a });
    expect(told.status).toBe(200);
    expect((await call("/api/me/summary", { cookie: a })).body.counts.episodes).toBe(1);
    expect((await call("/api/me/summary", { cookie: b })).body.counts.episodes).toBe(0);
    expect((await call("/api/me/tell", { json: { message: "   " }, cookie: a })).status).toBe(400);
    const f = await call("/api/me/forget", { json: { episode: told.body.episode.id }, cookie: a });
    expect(f.status).toBe(200);
    expect((await call("/api/me/summary", { cookie: a })).body.counts.forgotten).toBe(1);
  });

  it("runs learn as a background job", async () => {
    const c = (await signIn(new Ed25519Keypair())).res.setCookie!.split(";")[0]!;
    await call("/api/me/tell", { json: { message: "hello" }, cookie: c });
    const started = await call("/api/me/learn", { json: {}, cookie: c });
    expect(started.status).toBe(202);
    let job = started.body.job;
    for (let i = 0; i < 50 && job.status === "running"; i++) {
      await new Promise((r) => setTimeout(r, 20));
      job = (await call(`/api/me/jobs/${job.id}`, { cookie: c })).body;
    }
    expect(job.status).toBe("done");
    expect(job.result.episodes).toBe(1);
  });

  it("public stats count agents", async () => {
    const s = (await call("/api/stats")).body;
    expect(s.agents).toBeGreaterThanOrEqual(3);
  });
});

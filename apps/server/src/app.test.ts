import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Engram, FakeAnchorer, InMemoryRemote, ScriptedLLM } from "@rohankumar4179/engram-sdk";
import { createApp } from "./app.js";
import { LinkService } from "./links.js";
import { exportAudit, readLink, startLink, syncLink, waitForLink } from "@rohankumar4179/engram-sdk";
import { Tenant, Tenants, agentName } from "./tenants.js";

let dir: string;
let base: string;
let stop: () => void;
const ownRemote = new InMemoryRemote();
const services = { remote: new InMemoryRemote(), anchorer: new FakeAnchorer(), llm: () => new ScriptedLLM([{ ops: [] }]), remoteFor: () => ownRemote };

// In-memory stand-in for the Walrus Memory registry on Sui.
const accounts = new Map<string, { id: string; owner: string; delegates: string[] }>();
const norm = (a: string) => `0x${a.replace(/^0x/, "").toLowerCase().padStart(64, "0")}`;
const pending = new Map<string, () => void>();
const chain = {
  find: async (owner: string) => accounts.get(norm(owner))?.id ?? null,
  read: async (id: string) => {
    const a = [...accounts.values()].find((x) => x.id === id)!;
    return { accountId: id, owner: a.owner, delegates: a.delegates.map((publicKey) => ({ publicKey, suiAddress: "0x0", label: "" })) };
  },
  buildCreate: async (sender: string) => {
    const bytes = Buffer.from(`create:${sender}`).toString("base64");
    pending.set(bytes, () => accounts.set(norm(sender), { id: `0xacc${accounts.size}`, owner: norm(sender), delegates: [] }));
    return bytes;
  },
  buildDelegate: async (sender: string, _id: string, pk: string) => {
    const bytes = Buffer.from(`delegate:${sender}:${pk}`).toString("base64");
    pending.set(bytes, () => accounts.get(norm(sender))!.delegates.push(pk));
    return bytes;
  },
  execute: async (bytes: string, signature: string) => {
    if (!signature) throw new Error("unsigned");
    pending.get(bytes)!();
    return "DIGEST";
  },
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "engram-server-"));
  // a small read-only demo repo
  const demoDir = join(dir, "demo");
  const e = Engram.init("demo-agent", { dir: demoDir, ...services });
  const ep = e.observe({ source: "user", data: "hi" });
  e.applyOp({ op: "create", key: "x", statement: "X.", confidence: 0.8, evidence: [ep.id], tags: ["x"], reason: "t" });
  await e.commit("demo");
  const server = createApp({ tenants: new Tenants(join(dir, "data"), services), demo: new Tenant("demo", demoDir, services, true), staticDir: null, storageChain: chain, limits: { auth: { max: 40, windowMs: 60_000 } }, links: new LinkService(join(dir, "data"), services.anchorer, undefined, async (b) => ({ ok: true, detail: `manifest blob ${b.slice(0, 10)}… is stored on Walrus (test)` })) });
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

  it("moves an agent to the owner's own Walrus Memory account", async () => {
    const kp = new Ed25519Keypair();
    const c = (await signIn(kp)).res.setCookie!.split(";")[0]!;
    let st = (await call("/api/me/storage", { cookie: c })).body;
    expect(st).toMatchObject({ mode: "hosted", accountId: null, next: "create-account" });
    // switching before setup is refused
    expect((await call("/api/me/storage/use", { json: { mode: "own" }, cookie: c })).status).toBe(400);
    for (const step of ["create-account", "authorize-key"]) {
      const { bytes } = (await call("/api/me/storage/tx", { json: { step }, cookie: c })).body;
      expect((await call("/api/me/storage/execute", { json: { bytes, signature: "sig" }, cookie: c })).status).toBe(200);
    }
    st = (await call("/api/me/storage", { cookie: c })).body;
    expect(st).toMatchObject({ delegateAuthorized: true, next: "switch" });
    st = (await call("/api/me/storage/use", { json: { mode: "own" }, cookie: c })).body;
    expect(st.next).toBe("done");
    // new memories now land in the owner's account (same agent dir, reopened)
    const t = new Tenant(kp.toSuiAddress(), join(dir, "data", "wallets", kp.toSuiAddress()), services);
    const ep = t.engram.observe({ source: "user", data: "My rent is 450 USDC" });
    t.engram.applyOp({ op: "create", key: "rent", statement: "Rent is 450 USDC.", confidence: 0.9, evidence: [ep.id], tags: ["rent"], reason: "t" });
    const before = ownRemote.items.length;
    await t.engram.commit("own storage");
    expect(ownRemote.items.length).toBeGreaterThan(before);
    // demo stays read-only
    expect((await call("/api/demo/storage")).status).toBe(403);
  });

  it("links a CLI/SDK agent to the wallet, verifies its syncs, shows it read-only", async () => {
    const owner = new Ed25519Keypair();
    const cookie = (await signIn(owner)).res.setCookie!.split(";")[0]!;
    // a local agent somewhere else
    const local = Engram.init("laptop-agent", { dir: join(dir, "laptop"), ...services });
    const ep = local.observe({ source: "user", data: "rent 450" });
    local.applyOp({ op: "create", key: "rent", statement: "Rent is 450.", confidence: 0.9, evidence: [ep.id], tags: ["rent"], reason: "t" });
    await local.commit("first");
    local.decide({ action: "no alert", input: 1, beliefs: ["b_rent"] });

    const start = await startLink(local, base, "my laptop");
    expect(start.url).toMatch(/\/link\?code=[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect((await call(`/api/link/poll?device=${start.device}`)).body.status).toBe("pending");
    expect((await call(`/api/link/info?code=${start.code}`)).status).toBe(401); // must be signed in
    expect((await call(`/api/link/info?code=${start.code}`, { cookie })).body).toMatchObject({ agent: "laptop-agent", label: "my laptop" });
    expect((await call("/api/link/decide", { json: { code: start.code, approve: true }, cookie })).body.status).toBe("approved");
    const link = await waitForLink(local, start, base, { intervalMs: 10 });
    expect(link.wallet).toBe(owner.toSuiAddress());
    expect(readLink(local)?.token).toBe(link.token);
    expect((await call(`/api/link/poll?device=${start.device}`)).body.status).toBe("expired"); // token handed out once

    const synced = await syncLink(local);
    expect(synced).toMatchObject({ commits: 1, receipts: 1 });
    const agents = (await call("/api/me/agents", { cookie })).body;
    expect(agents.linked).toHaveLength(1);
    expect(agents.linked[0]).toMatchObject({ agent: "laptop-agent", label: "my laptop", commits: 1, receipts: 1 });
    const id = agents.linked[0].id;
    expect((await call(`/api/linked/${id}/summary`, { cookie })).body.counts.commits).toBe(1);
    const blame = (await call(`/api/linked/${id}/belief/b_rent`, { cookie })).body;
    expect(blame.error ?? "").toBe("");
    expect(blame.evidence[0].episode.summary).toMatch(/private/);
    const v = (await call(`/api/linked/${id}/verify/HEAD`, { cookie })).body;
    expect(v.ok).toBe(true);
    // The server can't read the owner's Walrus Memory, but checks the manifest blob is stored.
    const walrus = v.checks.find((c: { name: string }) => c.name === "walrus");
    expect(walrus.skipped).toBeFalsy();
    expect(walrus.detail).toMatch(/stored on Walrus/);

    // another wallet can't see it
    const other = (await signIn(new Ed25519Keypair())).res.setCookie!.split(";")[0]!;
    expect((await call(`/api/linked/${id}/summary`, { cookie: other })).status).toBe(404);
    // tampered bundle is refused
    const post = (b: unknown, token = link.token) => fetch(`${base}/api/link/sync`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(b) });
    const bad = exportAudit(local);
    bad.beliefs[0]!.statement = "Rent is 45.";
    const r1 = await post(bad);
    expect(r1.status).toBe(400);
    expect((await r1.json()).error).toMatch(/failed verification/);
    // a bundle from another agent key is refused
    const imposter = Engram.init("laptop-agent", { dir: join(dir, "imposter"), ...services });
    const r2 = await post(exportAudit(imposter));
    expect((await r2.json()).error).toMatch(/different agent key/);
    // history can't be rewritten: a bundle without the synced head is refused
    const rewritten = exportAudit(local);
    rewritten.commits = [];
    rewritten.head = null;
    expect((await (await post(rewritten)).json()).error).toMatch(/history rewrite/);
    // unlink revokes the token
    await call("/api/me/agents/unlink", { json: { id }, cookie });
    expect((await post(exportAudit(local))).status).toBe(401);
    expect((await call("/api/me/agents", { cookie })).body.linked).toHaveLength(0);
  });

  it("rate-limits sign-in attempts per client", async () => {
    let last = 0;
    for (let i = 0; i < 45; i++) last = (await call("/api/auth/challenge", { json: { address: "0x1" } })).status;
    expect(last).toBe(429);
  });

  it("public stats count agents", async () => {
    const s = (await call("/api/stats")).body;
    expect(s.agents).toBeGreaterThanOrEqual(3);
  });
});

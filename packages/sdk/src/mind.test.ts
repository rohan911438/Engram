import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeAnchorer } from "./anchor.js";
import type { LLM } from "./llm.js";
import { engram, type Mind } from "./mind.js";

/** An LLM that turns the first episode it's shown into a "rent" belief. */
const rentLLM: LLM = {
  name: "test",
  async json<T>(_system: string, prompt: string): Promise<T> {
    const ep = /ep_[0-9a-f]+/.exec(prompt)?.[0];
    return { ops: ep ? [{ op: "create", key: "rent", statement: "Owner pays 450 USDC rent monthly.", confidence: 0.9, evidence: [ep], tags: ["rent"], reason: "owner said so" }] : [] } as T;
  },
};

let dir: string;
let mind: Mind;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "engram-mind-"));
  mind = engram({ agent: "test-agent", dir, walrus: "memory", llm: rentLLM, anchor: new FakeAnchorer(), env: {} });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("engram() high-level API", () => {
  it("observe → sleep → commit → beliefs / at / verify", async () => {
    mind.observe({ source: "user", data: "My rent is 450 USDC on the 1st" });
    const r = await mind.sleep();
    expect(r.created.map((b) => b.id)).toEqual(["b_rent"]);
    const c = await mind.commit("first");
    expect(mind.log()).toHaveLength(1);
    expect((await mind.beliefs()).map((b) => b.id)).toEqual(["b_rent"]);
    expect((await mind.beliefs({ about: "rent payment" }))[0]?.id).toBe("b_rent");
    expect(mind.at("HEAD").map((b) => b.id)).toEqual(["b_rent"]);
    const v = await mind.verify(c.id);
    expect(v.ok).toBe(true);
    expect(v.checks.find((x) => x.name === "sui anchor")?.skipped).toBe(false);
    expect((await mind.verify("HEAD", { offline: true })).ok).toBe(true);
  });

  it("wrap: passes committed beliefs in and signs a receipt per call", async () => {
    mind.observe({ source: "user", data: "rent 450" });
    await mind.sleep();
    await mind.commit("first");
    const seen: string[][] = [];
    const agent = mind.wrap(async (tx: { amount: number }, beliefs) => {
      seen.push(beliefs.map((b) => b.id));
      return { alert: tx.amount !== 450, uses: ["b_rent"] };
    }, { used: (out) => out.uses, action: (out) => (out.alert ? "alert" : "quiet") });

    const out = await agent({ amount: 450 });
    expect(out).toEqual({ alert: false, uses: ["b_rent"] });
    expect(seen[0]).toEqual(["b_rent"]);
    expect(agent.lastReceipt?.beliefs).toEqual(["b_rent@1"]);
    expect(agent.lastReceipt?.action).toBe("quiet");
    const v = await mind.verify(agent.lastReceipt!.id);
    expect(v.ok).toBe(true);
    // the input was also recorded as an episode
    expect(mind.core.episodes().length).toBe(2);
  });

  it("wrap before the first commit runs the agent without a receipt", async () => {
    const agent = mind.wrap((x: number) => x * 2, { observe: false });
    expect(await agent(21)).toBe(42);
    expect(agent.lastReceipt).toBeNull();
  });

  it("forget retracts what depended on the episode", async () => {
    const ep = mind.observe({ source: "user", data: "rent 450" });
    await mind.sleep();
    const f = mind.forget(ep.id);
    expect(f.retracted.map((b) => b.id)).toEqual(["b_rent"]);
  });

  it("reopens the same repo, and refuses a different agent name", () => {
    expect(engram({ agent: "test-agent", dir, walrus: "memory", llm: rentLLM, env: {} }).agent).toBe("test-agent");
    expect(() => engram({ agent: "other", dir, walrus: "memory", env: {} })).toThrow(/holds agent/);
  });
});

describe("audit bundle", () => {
  it("exports and verifies without the repo; catches tampering", async () => {
    const { exportAudit, verifyAudit } = await import("./audit.js");
    mind.observe({ source: "user", data: "rent 450" });
    await mind.sleep();
    await mind.commit("first");
    const agent = mind.wrap(async () => ({ ok: true }), { used: () => ["b_rent"], observe: false });
    await agent(1);
    mind.forget(mind.core.episodes()[0]!.id);
    await mind.commit("after forget");

    const bundle = JSON.parse(JSON.stringify(exportAudit(mind.core)));
    expect(bundle.commits).toHaveLength(2);
    expect(bundle.receipts).toHaveLength(1);
    const good = await verifyAudit(bundle);
    expect(good.ok).toBe(true);
    expect(good.summary).toMatchObject({ commits: 2, receipts: 1 });

    const editedBelief = structuredClone(bundle);
    editedBelief.beliefs[0].statement = "Owner pays 45 USDC rent.";
    const r1 = await verifyAudit(editedBelief);
    expect(r1.ok).toBe(false);
    expect(r1.checks.some((c) => /Merkle root|invalid proof/.test(c.detail))).toBe(true);

    const droppedCommit = structuredClone(bundle);
    droppedCommit.commits.pop();
    expect((await verifyAudit(droppedCommit)).checks.some((c) => /not in the bundle/.test(c.detail))).toBe(true);

    const forgedReceipt = structuredClone(bundle);
    forgedReceipt.receipts[0].action = "something else";
    expect((await verifyAudit(forgedReceipt)).checks.find((c) => c.subject.startsWith("receipt"))?.detail).toMatch(/bad signature/);

    const anchored = await verifyAudit(bundle, { anchorer: mind.core.anchorer });
    expect(anchored.summary.anchored).toBe(2);
  });
});

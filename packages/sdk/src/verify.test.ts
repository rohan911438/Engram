import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Engram } from "./engram.js";
import { InMemoryRemote } from "./remote.js";
import { FakeAnchorer } from "./anchor.js";
import type { Receipt } from "./types.js";

let dir: string;
let remote: InMemoryRemote;
let anchorer: FakeAnchorer;
let e: Engram;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "engram-"));
  remote = new InMemoryRemote();
  anchorer = new FakeAnchorer();
  e = Engram.init("t", { dir, remote, anchorer });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function setup() {
  const ep1 = e.observe({ source: "tatum", data: { amount: 450, to: "0x7a" } });
  const ep2 = e.observe({ source: "user", data: "that's rent" });
  const ep3 = e.observe({ source: "tatum", data: { amount: 2100, from: "acme" } });
  e.applyOp({ op: "create", key: "rent", statement: "Rent is 450 to 0x7a.", confidence: 0.9, evidence: [ep1.id, ep2.id], tags: ["rent"], reason: "r" });
  e.applyOp({ op: "create", key: "salary", statement: "Salary 2100 from acme.", confidence: 0.7, evidence: [ep3.id], tags: ["income"], reason: "r" });
  const c = await e.commit("first");
  return { ep1, ep2, ep3, c };
}
const failed = (r: { checks: { name: string; ok: boolean }[] }) => r.checks.filter((c) => !c.ok).map((c) => c.name);

describe("receipts", () => {
  it("requires a commit, and only cites committed beliefs", async () => {
    expect(() => e.decide({ action: "x", input: 1, beliefs: [] })).toThrow(/commit before/);
    await setup();
    expect(() => e.decide({ action: "x", input: 1, beliefs: ["b_nope"] })).toThrow(/not in the HEAD commit/);
    e.applyOp({ op: "revise", belief: "b_rent", statement: "Rent is 500.", confidence: 0.9, evidence: [e.belief("b_rent")!.evidence[0]!], tags: [], reason: "r" });
    // uncommitted b_rent@2 can't be cited; the HEAD version is used for "b_rent"
    expect(() => e.decide({ action: "x", input: 1, beliefs: ["b_rent@2"] })).toThrow(/not in the HEAD commit/);
    expect(e.decide({ action: "x", input: 1, beliefs: ["b_rent"] }).beliefs).toEqual(["b_rent@1"]);
  });

  it("a fresh receipt verifies fully; short ids resolve", async () => {
    await setup();
    const r = e.decide({ action: "skip alert: rent payment", input: { tx: "abc" }, beliefs: ["b_rent", "b_salary"] });
    const rep = await e.verifyReceipt(r.id.slice(0, 8));
    expect(failed(rep)).toEqual([]);
    expect(rep.ok).toBe(true);
    expect(rep.checks.map((c) => c.name)).toContain("commit sui anchor");
  });

  it("detects a forged receipt, a tampered belief and a tampered proof", async () => {
    await setup();
    const r = e.decide({ action: "skip alert", input: 1, beliefs: ["b_rent"] });

    e.store.put("receipts", r.id, { ...r, action: "send 10000 USDC" } satisfies Receipt);
    expect(failed(await e.verifyReceipt(r.id))).toEqual(["receipt signature"]);
    e.store.put("receipts", r.id, r);

    const b = e.belief("b_rent@1")!;
    e.store.put("beliefs", "b_rent@1", { ...b, statement: "Rent is 4500 to 0xEVIL." });
    expect(failed(await e.verifyReceipt(r.id))).toEqual(["belief proofs", "commit merkle root"]);
    e.store.put("beliefs", "b_rent@1", b);

    const proofs = { "b_rent@1": [{ hash: "00".repeat(32), left: true }] };
    const forged = { ...r, proofs };
    e.store.put("receipts", r.id, forged);
    expect(failed(await e.verifyReceipt(r.id))).toContain("belief proofs");
  });

  it("detects a fake anchor and a manifest missing from Walrus", async () => {
    const { c } = await setup();
    e.store.put("commits", c.id, { ...c, anchor: { ...c.anchor!, txDigest: "fake" } });
    expect(failed(await e.verifyCommit("HEAD"))).toEqual(["sui anchor"]);
    e.store.put("commits", c.id, c);
    remote.items.splice(remote.items.findIndex((i) => i.blobId === c.manifestBlobId), 1);
    expect(failed(await e.verifyCommit("HEAD"))).toEqual(["walrus"]);
    expect((await e.verifyCommit("HEAD", { walrus: false, chain: false })).ok).toBe(true);
  });

  it("receipts are pushed to the receipts namespace", async () => {
    await setup();
    e.decide({ action: "a", input: 1, beliefs: ["b_rent"] });
    expect((await e.push()).receipts).toBe(1);
    expect(remote.items.filter((i) => i.namespace === "engram-t-receipts")).toHaveLength(1);
  });
});

describe("forget", () => {
  it("shreds the key, retracts or revises dependent beliefs, and tombstones the next commit", async () => {
    const { ep1, ep3, c } = await setup();
    const r = e.decide({ action: "skip alert", input: 1, beliefs: ["b_rent", "b_salary"] });

    const f1 = e.forget(ep3.id);
    expect(f1.retracted.map((b) => b.id)).toEqual(["b_salary"]);
    expect(e.read(ep3.id)).toBeNull();
    expect(() => e.forget(ep3.id)).toThrow(/already forgotten/);

    const f2 = e.forget(ep1.id);
    expect(f2.revised.map((b) => `${b.id}@${b.version}`)).toEqual(["b_rent@2"]);
    expect(e.belief("b_rent")!.evidence).not.toContain(ep1.id);

    // the ciphertext is still in the local vault file? No — the wrapped key is gone.
    const vault = readFileSync(join(dir, ".engram", "vault.json"), "utf8");
    expect(vault).not.toContain(`"${ep3.keyId}": {`);

    const c2 = await e.commit("forget salary + rent tx");
    expect(c2.manifest.tombstones).toEqual([ep1.id, ep3.id].sort());
    expect(c2.manifest.beliefs).toEqual(["b_rent@2"]);
    expect((await e.verifyCommit("HEAD")).ok).toBe(true);

    // old receipts still verify against the old commit — history isn't rewritten
    expect((await e.verifyReceipt(r.id)).ok).toBe(true);
    expect(e.blame("b_salary@1").evidence[0]!.content).toBeNull();
    expect(c.id).not.toBe(c2.id);
  });

  it("does not push a forgotten episode that never left the machine", async () => {
    const ep = e.observe({ source: "user", data: "oops, my password" });
    e.forget(ep.id);
    expect((await e.push()).episodes).toBe(0);
    expect(remote.items).toHaveLength(0);
  });
});

describe("act", () => {
  it("passes committed beliefs, keeps only real ones in the receipt, and skips receipts before any commit", async () => {
    const early = await e.act({ query: "rent", input: 1 }, (bs) => ({ action: "alert", used: [], result: bs.length }));
    expect(early).toMatchObject({ result: 0, receipt: null });
    await setup();
    const r = await e.act({ query: "rent payment", input: { tx: "t1" } }, (bs) => ({
      action: "no alert: rent",
      used: ["b_rent", "b_made_up", "b_rent@1"],
      result: bs.map((b) => b.id).sort(),
    }));
    expect(r.result).toEqual(["b_rent", "b_salary"]);
    expect(r.receipt!.beliefs).toEqual(["b_rent@1"]);
    expect((await e.verifyReceipt(r.receipt!.id)).ok).toBe(true);
  });
});

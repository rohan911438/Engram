import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Engram, NothingToCommitError, beliefKey } from "./engram.js";
import { InMemoryRemote } from "./remote.js";
import { FakeAnchorer } from "./anchor.js";
import { buildCommitTree, beliefLeaf, commitId, proofFor, verifyBeliefProof, verifyManifestSignature } from "./proof.js";
import { blobIdFromU256 } from "./tatum.js";
import type { Belief } from "./types.js";

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

function create(key: string, statement: string, evidence: string[]) {
  return e.applyOp({ op: "create", key, statement, confidence: 0.8, evidence, tags: [key], reason: "test" });
}

describe("proof", () => {
  const b: Belief = { id: "b_x", version: 1, statement: "s", confidence: 0.5, evidence: ["ep_2", "ep_1"], tags: ["b", "a"], status: "active", createdAt: 1 };

  it("leaf ignores order of evidence/tags and non-committed fields, but not content", () => {
    expect(beliefLeaf({ ...b, evidence: ["ep_1", "ep_2"], tags: ["a", "b"], reason: "x", blobId: "y", createdAt: 9 })).toBe(beliefLeaf(b));
    expect(beliefLeaf({ ...b, statement: "S" })).not.toBe(beliefLeaf(b));
    expect(beliefLeaf({ ...b, confidence: 0.51 })).not.toBe(beliefLeaf(b));
    expect(beliefLeaf({ ...b, evidence: ["ep_1"] })).not.toBe(beliefLeaf(b));
  });

  it("root is independent of input order; proofs verify; tombstones count", () => {
    const c = { ...b, id: "b_y" };
    const t1 = buildCommitTree([b, c], []);
    expect(buildCommitTree([c, b], []).tree.root).toBe(t1.tree.root);
    expect(verifyBeliefProof(c, proofFor(t1, "b_y@1"), t1.tree.root)).toBe(true);
    expect(verifyBeliefProof({ ...c, statement: "evil" }, proofFor(t1, "b_y@1"), t1.tree.root)).toBe(false);
    expect(buildCommitTree([b, c], ["ep_9"]).tree.root).not.toBe(t1.tree.root);
  });

  it("decodes Walrus u256 blob ids", () => {
    expect(blobIdFromU256("89267927616064785408649041539852631935780876581127408957692924624830155979274")).toBe("Cvpj_r4pUzFHJ440LUPThP_EN3oMO5Z8lNjsuUXbW8U");
  });
});

describe("commit", () => {
  it("refuses an empty first commit and an unchanged commit", async () => {
    await expect(e.commit("empty")).rejects.toBeInstanceOf(NothingToCommitError);
    const ep = e.observe({ source: "user", data: 1 });
    create("a", "A", [ep.id]);
    await e.commit("one");
    await expect(e.commit("again")).rejects.toBeInstanceOf(NothingToCommitError);
  });

  it("pushes, signs, stores the manifest on the remote and anchors it", async () => {
    const ep = e.observe({ source: "user", data: 1 });
    create("a", "A", [ep.id]);
    const c = await e.commit("first");
    expect(c.id).toBe(commitId(c.manifest));
    expect(verifyManifestSignature(c.manifest, c.signature)).toBe(true);
    expect(verifyManifestSignature({ ...c.manifest, message: "x" }, c.signature)).toBe(false);
    expect(c.manifest.parent).toBeNull();
    expect(c.manifest.beliefs).toEqual(["b_a@1"]);
    expect(c.manifest.episodes[ep.id]).toBe(e.episode(ep.id)!.blobId);
    expect(c.manifest.beliefBlobs["b_a@1"]).toBe(e.belief("b_a@1")!.blobId);
    expect(remote.items.map((i) => i.namespace)).toEqual(["engram-t-episodes", "engram-t-beliefs", "engram-t-commits"]);
    expect(remote.items[2]!.blobId).toBe(c.manifestBlobId);
    expect(c.anchor?.txDigest).toBeTruthy();
    expect(e.head()).toBe(c.id);
  });

  it("builds a history; log, resolve, beliefsAt, diff, blame", async () => {
    const ep1 = e.observe({ source: "tatum", data: { amount: 450 } });
    create("rent", "Rent is 450.", [ep1.id]);
    create("swap", "Swaps monthly.", [ep1.id]);
    const c1 = await e.commit("week 1");

    const ep2 = e.observe({ source: "user", data: "rent is 500 now" });
    e.applyOp({ op: "revise", belief: "b_rent", statement: "Rent is 500.", confidence: 0.9, evidence: [ep1.id, ep2.id], tags: [], reason: "user" });
    e.applyOp({ op: "retract", belief: "b_swap", reason: "stopped" });
    create("salary", "Salary on the 25th.", [ep2.id]);
    const c2 = await e.commit("week 2");

    expect(e.log().map((c) => c.manifest.message)).toEqual(["week 2", "week 1"]);
    expect(c2.manifest.parent).toBe(c1.id);
    expect(e.resolve("HEAD~1")).toBe(c1.id);
    expect(e.resolve(c1.id.slice(0, 6))).toBe(c1.id);
    expect(() => e.resolve("HEAD~5")).toThrow();
    expect(() => e.resolve("1999-01-01")).toThrow(/no commit/);
    expect(e.resolve(new Date(c2.manifest.ts).toISOString())).toBe(c2.id);

    expect(e.beliefsAt("HEAD~1").map(beliefKey).sort()).toEqual(["b_rent@1", "b_swap@1"]);
    expect(e.beliefsAt("HEAD").map(beliefKey).sort()).toEqual(["b_rent@2", "b_salary@1"]);

    const d = e.diff("HEAD~1", "HEAD");
    expect(d.added.map(beliefKey)).toEqual(["b_salary@1"]);
    expect(d.changed.map(([a, b]) => `${beliefKey(a)}→${beliefKey(b)}`)).toEqual(["b_rent@1→b_rent@2"]);
    expect(d.removed.map(beliefKey)).toEqual(["b_swap@1"]);

    const bl = e.blame("b_rent");
    expect(bl.history.map((b) => b.version)).toEqual([1, 2]);
    expect(bl.evidence.map((x) => x.content?.data)).toEqual([{ amount: 450 }, "rent is 500 now"]);
    expect(e.blame("b_rent@1").evidence).toHaveLength(1);
  });

  it("detects broken history", async () => {
    const ep = e.observe({ source: "user", data: 1 });
    create("a", "A", [ep.id]);
    const c = await e.commit("one");
    e.store.put("commits", c.id, { ...c, manifest: { ...c.manifest, parent: "f".repeat(64) } });
    expect(() => e.log()).toThrow(/broken history/);
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Engram, FakeAnchorer, InMemoryRemote } from "@rohankumar4179/engram-sdk";
import { createUiServer } from "./ui-server.js";

let dir: string;
let base: string;
let close: () => void;
let receiptId: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "engram-ui-"));
  const e = Engram.init("ui-test", { dir, remote: new InMemoryRemote(), anchorer: new FakeAnchorer() });
  const ep = e.observe({ source: "user", summary: "note", data: { message: "rent is 450" } });
  e.applyOp({ op: "create", key: "rent", statement: "Rent is 450.", confidence: 0.9, evidence: [ep.id], tags: ["rent"], reason: "t" });
  await e.commit("first");
  receiptId = e.decide({ action: "no alert: rent", input: 1, beliefs: ["b_rent"] }).id;
  const staticDir = join(dir, "site");
  mkdirSync(staticDir);
  writeFileSync(join(staticDir, "index.html"), "<html>inspector</html>");
  writeFileSync(join(dir, "secret.txt"), "top secret");
  const server = createUiServer(e, { staticDir });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => {
  close();
  rmSync(dir, { recursive: true, force: true });
});

const get = async (p: string) => {
  const r = await fetch(base + p);
  return { status: r.status, body: r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text() };
};

describe("ui server", () => {
  it("serves summary, commits, state, belief blame and receipts", async () => {
    const s = (await get("/api/summary")).body;
    expect(s).toMatchObject({ agent: "ui-test", counts: { beliefs: 1, commits: 1, receipts: 1 } });
    const commits = (await get("/api/commits")).body;
    expect(commits[0].diff.added).toEqual(["b_rent@1"]);
    const state = (await get(`/api/state?at=${commits[0].id}`)).body;
    expect(state.beliefs[0].id).toBe("b_rent");
    expect(state.episodes[0]).not.toHaveProperty("envelope"); // no ciphertext sent to the UI
    const blame = (await get("/api/belief/b_rent%401")).body;
    expect(blame.evidence[0].content.data).toEqual({ message: "rent is 450" });
    expect((await get("/api/receipts")).body).toHaveLength(1);
  });

  it("verifies commits and receipts", async () => {
    expect((await get("/api/verify/HEAD")).body.ok).toBe(true);
    expect((await get(`/api/verify/${receiptId}`)).body.ok).toBe(true);
  });

  it("is read-only, rejects unknown endpoints, and reports bad refs", async () => {
    expect((await fetch(`${base}/api/summary`, { method: "POST" })).status).toBe(405);
    expect((await get("/api/nope")).status).toBe(404);
    expect((await get("/api/belief/b_missing")).status).toBe(400);
  });

  it("serves the SPA and never files outside its folder", async () => {
    expect((await get("/")).body).toContain("inspector");
    expect((await get("/mind/deep/link")).body).toContain("inspector");
    for (const p of ["/../secret.txt", "/%2e%2e/secret.txt", "/..%5csecret.txt"]) {
      const r = await get(p);
      expect(String(r.body)).not.toContain("top secret");
    }
  });
});

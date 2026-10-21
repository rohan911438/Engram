import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Engram, parseBeliefText, beliefText } from "./engram.js";
import { InMemoryRemote } from "./remote.js";
import { GeminiLLM, ScriptedLLM } from "./llm.js";
import { slug, validateOps } from "./consolidator.js";

let dir: string;
let remote: InMemoryRemote;
let e: Engram;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "engram-"));
  remote = new InMemoryRemote();
  e = Engram.init("t", { dir, remote });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("sleep", () => {
  it("creates, revises and retracts beliefs as immutable versions", async () => {
    const a = e.observe({ source: "tatum", data: { to: "0x7a", amount: 450 } });
    const llm = new ScriptedLLM([
      { ops: [{ op: "create", key: "rent", statement: "Owner pays 450 USDC rent to 0x7a monthly.", confidence: 0.5, evidence: [a.id], tags: ["Rent"], reason: "one transfer" }] },
    ]);
    const r1 = await e.sleep({ llm });
    expect(r1.created.map((b) => b.id)).toEqual(["b_rent"]);
    expect(r1.created[0]!.tags).toEqual(["rent"]);
    expect(e.pendingEpisodes()).toHaveLength(0);
    expect(llm.calls[0]!.prompt).toContain(a.id);
    expect(llm.calls[0]!.prompt).toContain("0x7a"); // decrypted content reaches the LLM

    const b = e.observe({ source: "user", data: "rent went up to 500" });
    const r2 = await e.sleep({ llm: new ScriptedLLM([{ ops: [{ op: "revise", belief: "b_rent", statement: "Owner pays 500 USDC rent to 0x7a monthly.", confidence: 0.9, evidence: [a.id, b.id], reason: "user correction" }] }]) });
    expect(r2.revised[0]).toMatchObject({ id: "b_rent", version: 2, supersedes: "b_rent@1", tags: ["rent"] });
    expect(e.belief("b_rent")!.statement).toContain("500");
    expect(e.belief("b_rent@1")!.statement).toContain("450");

    e.observe({ source: "user", data: "I moved out" });
    await e.sleep({ llm: new ScriptedLLM([{ ops: [{ op: "retract", belief: "b_rent", reason: "moved" }] }]) });
    expect(e.beliefs()).toHaveLength(0);
    expect(e.history("b_rent").map((x) => `${x.version}:${x.status}`)).toEqual(["1:active", "2:active", "3:retracted"]);
  });

  it("repairs a rejected suggestion with one follow-up call", async () => {
    const a = e.observe({ source: "user", data: "rent is 450" });
    const llm = new ScriptedLLM([
      { ops: [{ op: "create", key: "rent", statement: "Rent is 450.", confidence: 0.8, reason: "r" }] }, // no evidence
      { ops: [{ op: "create", key: "rent", statement: "Rent is 450.", confidence: 0.8, evidence: [a.id], reason: "r" }] },
    ]);
    const r = await e.sleep({ llm });
    expect(r.created.map((b) => b.id)).toEqual(["b_rent"]);
    expect(r.rejected).toEqual([]);
    expect(llm.calls[1]!.prompt).toContain("REJECTED");
  });

  it("does nothing (and calls no LLM) when there are no new episodes", async () => {
    const llm = new ScriptedLLM([]);
    expect((await e.sleep({ llm })).episodes).toBe(0);
    expect(llm.calls).toHaveLength(0);
  });

  it("batches episodes", async () => {
    for (let i = 0; i < 5; i++) e.observe({ source: "user", data: i });
    const llm = new ScriptedLLM([{ ops: [] }, { ops: [] }, { ops: [] }]);
    expect((await e.sleep({ llm, batchSize: 2 })).episodes).toBe(5);
    expect(llm.calls).toHaveLength(3);
  });

  it("gives duplicate keys unique ids", async () => {
    const a = e.observe({ source: "user", data: 1 });
    await e.sleep({ llm: new ScriptedLLM([{ ops: [
      { op: "create", key: "x", statement: "A", confidence: 0.5, evidence: [a.id], reason: "r" },
      { op: "create", key: "x", statement: "B", confidence: 0.5, evidence: [a.id], reason: "r" },
    ] }]) });
    expect(e.beliefs().map((b) => b.id).sort()).toEqual(["b_x", "b_x_2"]);
  });
});

describe("validateOps", () => {
  const input = {
    episodes: [{ id: "ep_1", content: { source: "user" as const, ts: 0, data: 1 } }],
    beliefs: [{ id: "b_old", version: 1, statement: "s", confidence: 0.5, evidence: ["ep_0"], tags: [], status: "active" as const, createdAt: 0 }],
  };

  it("rejects invented evidence, unknown beliefs, double edits and bad ops; clamps confidence", () => {
    const { ops, rejected } = validateOps([
      { op: "create", key: "a", statement: "ok", confidence: 7, evidence: ["ep_1", "ep_fake"], reason: "r" },
      { op: "create", key: "b", statement: "bad", confidence: 0.5, evidence: ["ep_fake"], reason: "r" },
      { op: "revise", belief: "b_nope", statement: "x", confidence: 0.5, evidence: ["ep_1"], reason: "r" },
      { op: "revise", belief: "b_old", statement: "x", confidence: 0.5, evidence: ["ep_0"], reason: "r" },
      { op: "retract", belief: "b_old", reason: "r" },
      { op: "delete_everything", reason: "r" },
      { op: "create", key: "c", statement: "  ", evidence: ["ep_1"], reason: "r" },
    ], input);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ op: "create", confidence: 0.99, evidence: ["ep_1"] });
    expect(ops[1]).toMatchObject({ op: "revise", belief: "b_old", evidence: ["ep_0"] });
    expect(rejected.map((r) => r.why)).toEqual([
      "no valid evidence (unknown: ep_fake)", "unknown belief", "belief changed twice", "unknown op", "empty statement",
    ]);
  });

  it("slug makes safe keys", () => {
    expect(slug("Rent Payment — Monthly!")).toBe("rent_payment_monthly");
    expect(slug("!!!")).toBe("belief");
  });
});

describe("push + relevant", () => {
  it("pushes belief versions to the beliefs namespace and finds them again", async () => {
    const a = e.observe({ source: "user", data: 1 });
    await e.sleep({ llm: new ScriptedLLM([{ ops: [
      { op: "create", key: "rent", statement: "Owner pays rent on the first of the month.", confidence: 0.8, evidence: [a.id], tags: ["rent"], reason: "r" },
      { op: "create", key: "salary", statement: "Salary arrives on the 25th.", confidence: 0.8, evidence: [a.id], tags: ["income"], reason: "r" },
    ] }]) });
    expect(await e.push()).toEqual({ episodes: 1, beliefs: 2, receipts: 0 });
    expect(remote.items.filter((i) => i.namespace === "engram-t-beliefs")).toHaveLength(2);
    expect((await e.relevant("when is rent paid", 1)).map((b) => b.id)).toEqual(["b_rent"]);
  });

  it("belief text round-trips its key", () => {
    const b = { id: "b_x", version: 3, statement: "s", confidence: 0.5, evidence: [], tags: [], status: "active" as const, createdAt: 1 };
    expect(parseBeliefText(beliefText(b))).toBe("b_x@3");
    expect(parseBeliefText("random memory")).toBeNull();
  });
});

describe("GeminiLLM", () => {
  const ok = (json: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] }), { status: 200 });

  it("rotates to the next key on 429", async () => {
    const used: string[] = [];
    const fetchFn = (async (_url: string, init: RequestInit) => {
      const key = (init.headers as Record<string, string>)["x-goog-api-key"]!;
      used.push(key);
      return key === "k1" ? new Response("quota", { status: 429 }) : ok({ ops: [] });
    }) as unknown as typeof fetch;
    const llm = new GeminiLLM({ apiKeys: ["k1", "k2"], fetch: fetchFn });
    expect(await llm.json("s", "p", {})).toEqual({ ops: [] });
    expect(used).toEqual(["k1", "k2"]);
  });

  it("falls back to the next model when every key gets 503", async () => {
    const urls: string[] = [];
    const fetchFn = (async (url: string) => {
      urls.push(url);
      return url.includes("/models/main:") ? new Response('{"error":{"message":"high demand"}}', { status: 503 }) : ok({ ops: ["x"] });
    }) as unknown as typeof fetch;
    const llm = new GeminiLLM({ apiKeys: ["k1", "k2"], model: "main", fallbackModels: ["backup"], fetch: fetchFn, retryDelayMs: 1 });
    expect(await llm.json("s", "p", {})).toEqual({ ops: ["x"] });
    expect(llm.lastModel).toBe("backup");
    expect(urls.filter((u) => u.includes("/main:"))).toHaveLength(4);
  });

  it("fails clearly on a 400", async () => {
    const llm = new GeminiLLM({ apiKeys: ["k"], fetch: (async () => new Response("bad", { status: 400 })) as unknown as typeof fetch });
    await expect(llm.json("s", "p", {})).rejects.toThrow(/HTTP 400/);
  });
});

describe("parseJsonLoose", () => {
  it("handles plain, fenced and embedded JSON", async () => {
    const { parseJsonLoose } = await import("./llm.js");
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoose('Sure!\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(parseJsonLoose('result: {"a":3} done')).toEqual({ a: 3 });
    expect(parseJsonLoose("no json here")).toBeUndefined();
  });

  it("sends gemma models a single prompt without JSON mode", async () => {
    let sent: any;
    const fetchFn = (async (_u: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "```json\n{\"ops\":[]}\n```" }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const llm = new GeminiLLM({ apiKeys: ["k"], model: "gemma-4-26b-a4b-it", fetch: fetchFn });
    expect(await llm.json("SYS", "PROMPT", { type: "object" })).toEqual({ ops: [] });
    expect(sent.systemInstruction).toBeUndefined();
    expect(sent.generationConfig.responseSchema).toBeUndefined();
    expect(sent.contents[0].parts[0].text).toContain("SYS");
  });
});

describe("GeminiLLM daily quota", () => {
  it("skips a key+model pair once its daily quota is used up", async () => {
    const calls: string[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      const key = (init.headers as Record<string, string>)["x-goog-api-key"]!;
      calls.push(`${key}:${url.includes("/a:") ? "a" : "b"}`);
      if (url.includes("/a:")) return new Response('{"error":{"details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}', { status: 429 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const llm = new GeminiLLM({ apiKeys: ["k1", "k2"], model: "a", fallbackModels: ["b"], fetch: fetchFn, retryDelayMs: 1 });
    await llm.json("s", "p", {});
    await llm.json("s", "p", {});
    expect(calls).toEqual(["k1:a", "k2:a", "k2:b", "k2:b"]);
  });
});

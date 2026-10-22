import { describe, expect, it } from "vitest";
import { RateLimiter, bucketFor, probeHealth } from "./guard.js";

describe("rate limiter", () => {
  it("allows up to max per window, then asks to wait", () => {
    const rl = new RateLimiter({ auth: { max: 2, windowMs: 60_000 } });
    expect(rl.check("ip1", "auth", 0)).toBe(0);
    expect(rl.check("ip1", "auth", 1)).toBe(0);
    expect(rl.check("ip1", "auth", 2)).toBe(60);
    expect(rl.check("ip2", "auth", 2)).toBe(0); // other clients unaffected
    expect(rl.check("ip1", "auth", 60_001)).toBe(0); // new window
    expect(rl.check("ip1", "nobucket", 3)).toBe(0);
  });

  it("puts requests in the right bucket", () => {
    expect(bucketFor("POST", "/api/auth/challenge")).toBe("auth");
    expect(bucketFor("GET", "/api/auth/me")).toBeNull();
    expect(bucketFor("POST", "/api/me/run")).toBe("jobs");
    expect(bucketFor("POST", "/api/me/tell")).toBe("writes");
    expect(bucketFor("GET", "/api/demo/verify/HEAD")).toBe("verify");
    expect(bucketFor("GET", "/api/me/summary")).toBeNull();
  });
});

describe("health probe", () => {
  const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  it("reports degraded writes, a down Sui reader and an LLM quota", async () => {
    const h = await probeHealth({
      walrusUrl: "https://relayer.example",
      fetch: (async () => res(200, { status: "ok", writes: "degraded" })) as unknown as typeof fetch,
      latestCheckpoint: async () => { throw new Error("UNAVAILABLE"); },
      llmConfigured: true,
      llmLastError: () => "LLM daily quota used up",
    });
    expect(h.walrus.state).toBe("degraded");
    expect(h.sui.state).toBe("down");
    expect(h.llm).toEqual({ state: "degraded", detail: "LLM daily quota used up" });
  });
  it("reports a relayer that is gone", async () => {
    const h = await probeHealth({ walrusUrl: "https://r", fetch: (async () => res(404, {})) as unknown as typeof fetch, llmConfigured: false });
    expect(h.walrus.state).toBe("down");
    expect(h.sui.state).toBe("not configured");
    expect(h.llm.state).toBe("not configured");
  });
});

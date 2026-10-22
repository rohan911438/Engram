import type { IncomingMessage } from "node:http";

/**
 * Fixed-window rate limiter keyed by client (IP) and bucket. Small and
 * in-process — enough for one server instance.
 */
export class RateLimiter {
  private hits = new Map<string, { windowStart: number; count: number }>();

  constructor(private limits: Record<string, { max: number; windowMs: number }>) {}

  /** Returns seconds to wait, or 0 if the request may go ahead. */
  check(client: string, bucket: string, now = Date.now()): number {
    const limit = this.limits[bucket];
    if (!limit) return 0;
    const key = `${bucket}:${client}`;
    const h = this.hits.get(key);
    if (!h || now - h.windowStart >= limit.windowMs) {
      this.hits.set(key, { windowStart: now, count: 1 });
      if (this.hits.size > 50_000) this.prune(now);
      return 0;
    }
    if (h.count >= limit.max) return Math.ceil((h.windowStart + limit.windowMs - now) / 1000);
    h.count++;
    return 0;
  }

  private prune(now: number) {
    const longest = Math.max(...Object.values(this.limits).map((l) => l.windowMs));
    for (const [k, v] of this.hits) if (now - v.windowStart > longest) this.hits.delete(k);
  }
}

/** Client IP; trusts X-Forwarded-For only when the server is told it's behind a proxy. */
export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  const fwd = trustProxy ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim() : "";
  return fwd || req.socket.remoteAddress || "unknown";
}

/** Which rate-limit bucket a request falls in. */
export function bucketFor(method: string, path: string): string | null {
  if (path.startsWith("/api/auth/")) return method === "POST" ? "auth" : null;
  if (method === "POST" && /^\/api\/me\/(run|sync|learn|commit)$/.test(path)) return "jobs";
  if (method === "POST" && path.startsWith("/api/me/")) return "writes";
  if (/\/verify\//.test(path)) return "verify";
  return null;
}

export const DEFAULT_LIMITS = {
  auth: { max: 20, windowMs: 60_000 },
  jobs: { max: 12, windowMs: 60 * 60_000 },
  writes: { max: 60, windowMs: 60_000 },
  verify: { max: 30, windowMs: 60_000 },
};

export type ServiceState = "ok" | "degraded" | "down" | "not configured";

export interface Health {
  checkedAt: number;
  walrus: { state: ServiceState; detail: string };
  sui: { state: ServiceState; detail: string };
  llm: { state: ServiceState; detail: string };
}

/** Probes the services the app depends on (cached by the caller). */
export async function probeHealth(o: {
  walrusUrl: string;
  latestCheckpoint?: () => Promise<string>;
  llmConfigured: boolean;
  llmLastError?: () => string | null;
  fetch?: typeof fetch;
}): Promise<Health> {
  const f = o.fetch ?? fetch;
  const walrus = await f(`${o.walrusUrl.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(8000) })
    .then(async (r) => {
      if (!r.ok) return { state: "down" as const, detail: `relayer answered HTTP ${r.status}` };
      const j = (await r.json().catch(() => ({}))) as { status?: string; writes?: string };
      if (j.status !== "ok") return { state: "down" as const, detail: "relayer reports it is not ok" };
      if (j.writes && j.writes !== "ok") return { state: "degraded" as const, detail: `relayer writes are ${j.writes} — Engram falls back to manual mode` };
      return { state: "ok" as const, detail: "relayer healthy" };
    })
    .catch((e: Error) => ({ state: "down" as const, detail: `relayer unreachable (${e.message})` }));
  const sui = o.latestCheckpoint
    ? await o.latestCheckpoint().then(
        (cp) => ({ state: "ok" as const, detail: `Tatum gRPC · checkpoint ${cp}` }),
        (e: Error) => ({ state: "down" as const, detail: `Tatum unreachable (${e.message.slice(0, 120)})` }),
      )
    : { state: "not configured" as const, detail: "no Tatum key" };
  const lastErr = o.llmLastError?.() ?? null;
  const llm = !o.llmConfigured
    ? { state: "not configured" as const, detail: "no LLM key" }
    : lastErr
      ? { state: "degraded" as const, detail: lastErr }
      : { state: "ok" as const, detail: "configured" };
  return { checkedAt: Date.now(), walrus, sui, llm };
}

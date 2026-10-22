import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { inspectApi, type TatumSui } from "@rohankumar4179/engram-sdk";
import { WalletAuth } from "./auth.js";
import type { Tenant, Tenants } from "./tenants.js";
import { DEFAULT_LIMITS, RateLimiter, bucketFor, clientIp, probeHealth, type Health } from "./guard.js";
import { lastLlmError } from "./tenants.js";
import { mainnetStorageChain, storageStatus, storageTx, useOwnStorage, type StorageChain } from "./storage.js";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

export interface AppOptions {
  tenants: Tenants;
  demo: Tenant | null;
  auth?: WalletAuth;
  tatum?: TatumSui;
  staticDir: string | null;
  /** Set the cookie's Secure flag (HTTPS deployments). */
  secureCookies?: boolean;
  /** Chain access for "use my own Walrus storage" (default: Sui Mainnet over gRPC). */
  storageChain?: StorageChain;
  /** Per-client limits; pass {} to disable (tests). */
  limits?: ConstructorParameters<typeof RateLimiter>[0];
  /** Trust X-Forwarded-For (set when running behind a proxy such as Railway). */
  trustProxy?: boolean;
  /** For GET /api/health. */
  walrusUrl?: string;
  llmConfigured?: boolean;
}

/**
 * Routes
 *   GET  /api/mode                      { mode: "hosted" }
 *   GET  /api/stats                     public numbers for the homepage
 *   GET  /api/health                    Walrus / Sui (Tatum) / LLM status
 *   GET  /api/auth/me                   { address | null }
 *   POST /api/auth/challenge {address}  → { nonce, message } to sign
 *   POST /api/auth/verify {nonce, signature}
 *   POST /api/auth/logout
 *   GET  /api/demo/<view>               read-only demo agent
 *   GET  /api/me/<view>                 your agent (summary, commits, state, episodes, belief/…, receipts, verify/…)
 *   POST /api/me/run|sync|learn|commit  background job → { job }
 *   GET  /api/me/jobs[/<id>]
 *   POST /api/me/tell {message}         tell your agent something
 *   POST /api/me/forget {episode}
 *   GET  /api/me/storage                where memories are stored + next setup step
 *   POST /api/me/storage/tx {step}      unsigned tx for the wallet (create-account | authorize-key)
 *   POST /api/me/storage/execute {bytes, signature}
 *   POST /api/me/storage/use {mode}     "own" (after setup) or "hosted"
 */
export function createApp(o: AppOptions) {
  const auth = o.auth ?? new WalletAuth();
  const chain = o.storageChain ?? mainnetStorageChain();
  const limiter = new RateLimiter(o.limits ?? DEFAULT_LIMITS);
  let health: { at: number; value: Promise<Health> } | null = null;

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    try {
      if (!path.startsWith("/api/")) {
        if (!o.staticDir) return send(res, 404, { error: "web app not built" });
        return serveStatic(o.staticDir, path, res);
      }
      const token = cookie(req, "engram_session");
      const bucket = bucketFor(req.method ?? "GET", path);
      const wait = bucket ? limiter.check(clientIp(req, !!o.trustProxy), bucket) : 0;
      if (wait > 0) {
        res.setHeader("retry-after", String(wait));
        return send(res, 429, { error: `Too many requests — try again in ${wait < 90 ? `${wait}s` : `${Math.ceil(wait / 60)} min`}.` });
      }
      if (path === "/api/health") {
        if (!health || Date.now() - health.at > 60_000) {
          health = { at: Date.now(), value: probeHealth({ walrusUrl: o.walrusUrl ?? "https://relayer.memory.walrus.xyz", latestCheckpoint: o.tatum ? () => o.tatum!.latestCheckpoint() : undefined, llmConfigured: o.llmConfigured ?? true, llmLastError: lastLlmError }) };
        }
        return send(res, 200, await health.value);
      }

      if (path === "/api/mode") return send(res, 200, { mode: "hosted", demo: !!o.demo });
      if (path === "/api/stats") return send(res, 200, await stats(o));
      if (path === "/api/auth/me") return send(res, 200, { address: auth.session(token) });

      if (req.method === "POST" && path === "/api/auth/challenge") {
        const { address } = await body<{ address?: string }>(req);
        return send(res, 200, auth.challenge(String(address ?? "")));
      }
      if (req.method === "POST" && path === "/api/auth/verify") {
        const { nonce, signature } = await body<{ nonce?: string; signature?: string }>(req);
        const s = await auth.verify(String(nonce ?? ""), String(signature ?? ""));
        o.tenants.forWallet(s.address); // create the agent on first sign-in
        res.setHeader("set-cookie", `engram_session=${s.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${o.secureCookies ? "; Secure" : ""}`);
        return send(res, 200, { address: s.address });
      }
      if (req.method === "POST" && path === "/api/auth/logout") {
        auth.logout(token);
        res.setHeader("set-cookie", "engram_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
        return send(res, 200, { ok: true });
      }

      const m = /^\/api\/(demo|me)\/([^/]+)(?:\/(.*))?$/.exec(path);
      if (!m) return send(res, 404, { error: "unknown endpoint" });
      const [, who, name, rest = ""] = m;
      let tenant: Tenant;
      if (who === "demo") {
        if (!o.demo) return send(res, 404, { error: "no demo agent on this server" });
        tenant = o.demo;
      } else {
        const address = auth.session(token);
        if (!address) return send(res, 401, { error: "connect and sign in with your wallet first" });
        tenant = o.tenants.forWallet(address);
      }

      if (name === "storage") {
        if (tenant.readOnly) return send(res, 403, { error: "the demo agent is read-only" });
        if (req.method !== "POST") return send(res, 200, await storageStatus(tenant, chain));
        const b = await body<{ step?: string; bytes?: string; signature?: string; mode?: string }>(req);
        if (rest === "tx") return send(res, 200, await storageTx(tenant, chain, String(b.step ?? "")));
        if (rest === "execute") {
          if (!b.bytes || !b.signature) return send(res, 400, { error: "bytes and signature are required" });
          const digest = await chain.execute(b.bytes, b.signature);
          return send(res, 200, { digest, status: await storageStatus(tenant, chain) });
        }
        if (rest === "use") {
          if (b.mode === "hosted") {
            tenant.useStorage("hosted");
            return send(res, 200, await storageStatus(tenant, chain));
          }
          return send(res, 200, await useOwnStorage(tenant, chain));
        }
        return send(res, 404, { error: "unknown storage action" });
      }

      if (req.method === "POST") {
        if (tenant.readOnly) return send(res, 403, { error: "the demo agent is read-only — connect your wallet to run your own" });
        const b = await body<{ message?: string; episode?: string }>(req);
        if (name === "run" || name === "sync" || name === "learn" || name === "commit") return send(res, 202, { job: tenant.start(name, { message: b.message }) });
        if (name === "tell") return send(res, 200, { episode: { id: tenant.tell(String(b.message ?? "")).id } });
        if (name === "forget") {
          const r = tenant.forget(String(b.episode ?? ""));
          return send(res, 200, { retracted: r.retracted.map((x) => x.id), revised: r.revised.map((x) => x.id) });
        }
        return send(res, 404, { error: "unknown action" });
      }

      if (name === "jobs") {
        if (rest) return send(res, 200, tenant.job(rest) ?? null);
        return send(res, 200, { current: tenant.current ?? null, recent: tenant.recentJobs() });
      }
      if (name === "whoami") return send(res, 200, { address: tenant.address, agent: tenant.engram.agent, readOnly: tenant.readOnly });
      const handler = inspectApi(tenant.engram)[name ?? ""];
      if (!handler) return send(res, 404, { error: "unknown endpoint" });
      return send(res, 200, await handler(url.searchParams, rest));
    } catch (err) {
      send(res, 400, { error: (err as Error).message });
    }
  });
}

let cachedStats: { at: number; value: unknown } | null = null;

/** Public numbers for the homepage (cached for 30 s). */
async function stats(o: AppOptions) {
  if (cachedStats && Date.now() - cachedStats.at < 30_000) return cachedStats.value;
  const tenants = [...o.tenants.all(), ...(o.demo ? [o.demo] : [])];
  let checkpoint: string | null = null;
  try {
    checkpoint = o.tatum ? await o.tatum.latestCheckpoint() : null;
  } catch {
    checkpoint = null;
  }
  const value = {
    agents: tenants.length,
    episodes: tenants.reduce((n, t) => n + t.engram.episodes().length, 0),
    beliefs: tenants.reduce((n, t) => n + t.engram.beliefs().length, 0),
    commits: tenants.reduce((n, t) => n + (t.engram.head() ? t.engram.log().length : 0), 0),
    receipts: tenants.reduce((n, t) => n + t.engram.receipts().length, 0),
    suiCheckpoint: checkpoint,
  };
  cachedStats = { at: Date.now(), value };
  return value;
}

function cookie(req: IncomingMessage, name: string): string | undefined {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(req.headers.cookie ?? "");
  return m?.[1];
}

async function body<T>(req: IncomingMessage): Promise<T> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20_000) throw new Error("request too large");
  }
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("invalid JSON body");
  }
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

function serveStatic(root: string, pathname: string, res: ServerResponse) {
  const base = resolve(root);
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  let file = resolve(join(base, rel));
  if (!file.startsWith(base)) return send(res, 403, { error: "forbidden" });
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(base, "index.html");
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type, "cache-control": file.includes(`${"assets"}`) ? "public, max-age=31536000, immutable" : "no-cache" });
  createReadStream(file).pipe(res);
}

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectApi, type Engram } from "@rohankumar4179/engram-sdk";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

/** Where the built inspector lives: bundled next to the CLI, or in the monorepo. */
export function findInspectorDist(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const p of [join(here, "inspector"), resolve(here, "../../../apps/web/dist")]) {
    if (existsSync(join(p, "index.html"))) return p;
  }
  return null;
}

export function createUiServer(engram: Engram, opts: { staticDir: string | null }) {
  const api = inspectApi(engram);

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (url.pathname.startsWith("/api/")) {
        if (req.method !== "GET") return send(res, 405, { error: "read-only" });
        const [name, ...rest] = url.pathname.slice(5).split("/");
        const handler = api[name ?? ""];
        if (!handler) return send(res, 404, { error: "unknown endpoint" });
        return send(res, 200, await handler(url.searchParams, rest.join("/")));
      }
      if (!opts.staticDir) return send(res, 404, { error: "inspector not built — run `pnpm --filter @engram/web build`" });
      serveStatic(opts.staticDir, url.pathname, res);
    } catch (err) {
      send(res, 400, { error: (err as Error).message });
    }
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function serveStatic(root: string, pathname: string, res: ServerResponse) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  let file = join(root, rel);
  if (!file.startsWith(root)) return send(res, 403, { error: "forbidden" });
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html"); // SPA fallback
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

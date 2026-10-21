import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beliefKey, type Belief, type Engram, type Episode } from "@engram/sdk";

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
  for (const p of [join(here, "inspector"), resolve(here, "../../../apps/inspector/dist")]) {
    if (existsSync(join(p, "index.html"))) return p;
  }
  return null;
}

/** Episode as sent to the UI — no ciphertext. */
function episodeView(e: Episode) {
  return { id: e.id, ts: e.ts, source: e.source, summary: e.summary ?? null, blobId: e.blobId ?? null, forgotten: !!e.forgottenAt, forgottenAt: e.forgottenAt ?? null };
}

function stateAt(engram: Engram, ref: string | null) {
  const beliefs: Belief[] = ref ? engram.beliefsAt(ref) : engram.beliefs();
  const ids = new Set(beliefs.flatMap((b) => b.evidence));
  const episodes = engram.episodes().filter((e) => ids.has(e.id)).map(episodeView);
  return { ref, beliefs, episodes };
}

export function createUiServer(engram: Engram, opts: { staticDir: string | null }) {
  const api: Record<string, (q: URLSearchParams, rest: string) => unknown | Promise<unknown>> = {
    summary: () => {
      const head = engram.head();
      const eps = engram.episodes();
      return {
        agent: engram.agent,
        publicKey: engram.publicKey,
        head,
        headCommit: head ? engram.getCommit(head) : null,
        namespaces: engram.config.namespaces,
        createdAt: engram.config.createdAt,
        counts: {
          episodes: eps.length,
          forgotten: eps.filter((e) => e.forgottenAt).length,
          beliefs: engram.beliefs().length,
          beliefVersions: engram.beliefVersions().length,
          commits: head ? engram.log().length : 0,
          receipts: engram.receipts().length,
          pending: engram.pendingEpisodes().length,
        },
      };
    },
    commits: () =>
      engram.log().map((c) => {
        const d = c.manifest.parent ? engram.diff(c.manifest.parent, c.id) : { added: engram.beliefsAt(c.id), changed: [], removed: [] };
        return { ...c, diff: { added: d.added.map(beliefKey), changed: d.changed.map(([a, b]) => [beliefKey(a), beliefKey(b)]), removed: d.removed.map(beliefKey) } };
      }),
    state: (q) => stateAt(engram, q.get("at")),
    episodes: () => engram.episodes().map(episodeView),
    belief: (_q, ref) => {
      const { belief, history, evidence } = engram.blame(decodeURIComponent(ref));
      return { belief, history, evidence: evidence.map((x) => ({ episode: episodeView(x.episode), content: x.content })) };
    },
    diff: (q) => {
      const d = engram.diff(q.get("from")!, q.get("to") ?? undefined);
      return { added: d.added, changed: d.changed, removed: d.removed };
    },
    receipts: () => engram.receipts().reverse(),
    verify: async (q, ref) => {
      const r = decodeURIComponent(ref);
      const opts = q.get("offline") ? { walrus: false, chain: false } : {};
      return r.startsWith("r_") ? engram.verifyReceipt(r, opts) : engram.verifyCommit(r, opts);
    },
  };

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
      if (!opts.staticDir) return send(res, 404, { error: "inspector not built — run `pnpm --filter @engram/inspector build`" });
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

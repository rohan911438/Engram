import { rmSync } from "node:fs";
import { exportAudit } from "./audit.js";
import type { Engram } from "./engram.js";

/**
 * Linking a local agent (CLI or SDK) to an Engram web app account, which is a
 * Sui wallet. Like `gh auth login`: the agent asks the server for a short code,
 * the owner approves it in the browser with their wallet, the agent gets a
 * token. After that, `sync` uploads the agent's audit bundle (commits,
 * beliefs, receipts — never raw episodes or keys); the server verifies it
 * before showing it on the owner's dashboard.
 */

export interface LinkInfo {
  server: string;
  token: string;
  wallet: string;
  linkedAt: number;
}

export interface LinkStart {
  code: string;
  /** Secret used only by this device to collect the token. */
  device: string;
  /** Page the owner opens to approve. */
  url: string;
  expiresAt: number;
}

export interface SyncResult {
  agentId: string;
  commits: number;
  receipts: number;
  anchored: number;
  url: string;
}

const LINK_FILE = "link.json";
export const DEFAULT_SERVER = process.env.ENGRAM_SERVER ?? "http://localhost:8787";

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) }, signal: init.signal ?? AbortSignal.timeout(120_000) });
  const text = await r.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${url} answered HTTP ${r.status} (not JSON)`);
  }
  if (!r.ok) throw new Error((body as { error?: string } | null)?.error ?? `HTTP ${r.status}`);
  return body as T;
}

const trim = (s: string) => s.replace(/\/+$/, "");

export function readLink(e: Engram): LinkInfo | null {
  return e.store.file<LinkInfo>(LINK_FILE).read();
}

export function removeLink(e: Engram): boolean {
  const f = e.store.file<LinkInfo>(LINK_FILE);
  if (!f.read()) return false;
  rmSync(f.path, { force: true });
  return true;
}

export async function startLink(e: Engram, server = DEFAULT_SERVER, label?: string): Promise<LinkStart> {
  return call<LinkStart>(`${trim(server)}/api/link/start`, { method: "POST", body: JSON.stringify({ agent: e.agent, agentPubKey: e.publicKey, label: label ?? e.agent }) });
}

/** Waits until the owner approves (or the code expires), then saves the token in `.engram/link.json`. */
export async function waitForLink(e: Engram, start: LinkStart, server = DEFAULT_SERVER, opts: { intervalMs?: number } = {}): Promise<LinkInfo> {
  for (;;) {
    const r = await call<{ status: "pending" | "approved" | "expired" | "denied"; token?: string; wallet?: string }>(`${trim(server)}/api/link/poll?device=${encodeURIComponent(start.device)}`);
    if (r.status === "approved" && r.token && r.wallet) {
      const info: LinkInfo = { server: trim(server), token: r.token, wallet: r.wallet, linkedAt: Date.now() };
      e.store.file<LinkInfo>(LINK_FILE).write(info);
      return info;
    }
    if (r.status === "expired") throw new Error("the link code expired — run link again");
    if (r.status === "denied") throw new Error("the link was declined in the browser");
    await new Promise((res) => setTimeout(res, opts.intervalMs ?? 2000));
  }
}

/** Uploads the agent's audit bundle to the linked dashboard. */
export async function syncLink(e: Engram, link = readLink(e)): Promise<SyncResult> {
  if (!link) throw new Error("not linked — run `engram link` first");
  if (!e.head()) throw new Error("nothing to sync — commit first");
  return call<SyncResult>(`${link.server}/api/link/sync`, { method: "POST", headers: { authorization: `Bearer ${link.token}` }, body: JSON.stringify(exportAudit(e)) });
}

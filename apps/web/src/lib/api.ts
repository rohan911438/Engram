import type { Belief, Commit, EpisodeContent, Receipt, VerifyReport } from "@engram/sdk";

export type { Belief, Commit, Receipt, VerifyReport };

export interface EpisodeView {
  id: string;
  ts: number;
  source: string;
  summary: string | null;
  blobId: string | null;
  forgotten: boolean;
  forgottenAt: number | null;
  consolidated?: boolean;
}

export interface Summary {
  agent: string;
  publicKey: string;
  head: string | null;
  headCommit: Commit | null;
  namespaces: Record<string, string>;
  createdAt: number;
  counts: { episodes: number; forgotten: number; beliefs: number; beliefVersions: number; commits: number; receipts: number; pending: number; unpushed?: number };
}

export interface CommitView extends Commit {
  diff: { added: string[]; changed: [string, string][]; removed: string[] };
}

export interface State {
  ref: string | null;
  beliefs: Belief[];
  episodes: EpisodeView[];
}

export interface BlameView {
  belief: Belief;
  history: Belief[];
  evidence: { episode: EpisodeView; content: EpisodeContent | null }[];
}

export type JobKind = "run" | "sync" | "learn" | "commit";

export interface Job {
  id: string;
  kind: JobKind;
  status: "running" | "done" | "failed";
  log: { ts: number; text: string }[];
  result?: unknown;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface Stats {
  agents: number;
  episodes: number;
  beliefs: number;
  commits: number;
  receipts: number;
  suiCheckpoint: string | null;
}

/**
 * Where agent data comes from:
 *   local: `engram ui` serving one repo at /api
 *   me:    the signed-in wallet's agent on the Engram server
 *   demo:  the read-only demo agent on the Engram server
 */
export type Source = "local" | "me" | "demo";
let base = "/api";
let source: Source = "local";
export function setSource(s: Source) {
  source = s;
  base = s === "local" ? "/api" : `/api/${s}`;
}
export const currentSource = () => source;

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const text = await r.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(`Unexpected response (HTTP ${r.status})`, r.status);
  }
  if (!r.ok) throw new ApiError((body as { error?: string } | null)?.error ?? `HTTP ${r.status}`, r.status);
  return body as T;
}

const get = <T,>(path: string) => request<T>(`${base}/${path}`);
const post = <T,>(path: string, data: unknown = {}) => request<T>(`${base}/${path}`, { method: "POST", body: JSON.stringify(data) });

/** Calls about the current agent (local, mine, or demo). */
export const api = {
  summary: () => get<Summary>("summary"),
  commits: () => get<CommitView[]>("commits"),
  state: (at?: string) => get<State>(`state${at ? `?at=${at}` : ""}`),
  episodes: () => get<EpisodeView[]>("episodes"),
  belief: (ref: string) => get<BlameView>(`belief/${encodeURIComponent(ref)}`),
  receipts: () => get<Receipt[]>("receipts"),
  verify: (ref: string, offline = false) => get<VerifyReport>(`verify/${encodeURIComponent(ref)}${offline ? "?offline=1" : ""}`),
  // actions — only for the signed-in wallet's own agent
  start: (kind: JobKind, message?: string) => post<{ job: Job }>(kind, { message }),
  job: (id: string) => get<Job | null>(`jobs/${id}`),
  jobs: () => get<{ current: Job | null; recent: Job[] }>("jobs"),
  tell: (message: string) => post<{ episode: { id: string } }>("tell", { message }),
  forget: (episode: string) => post<{ retracted: string[]; revised: string[] }>("forget", { episode }),
  storage: () => get<StorageStatus>("storage"),
  storageTx: (step: "create-account" | "authorize-key") => post<{ bytes: string }>("storage/tx", { step }),
  storageExecute: (bytes: string, signature: string) => post<{ digest: string; status: StorageStatus }>("storage/execute", { bytes, signature }),
  storageUse: (mode: "own" | "hosted") => post<StorageStatus>("storage/use", { mode }),
};

export interface StorageStatus {
  mode: "hosted" | "own";
  accountId: string | null;
  delegate: { publicKey: string; suiAddress: string };
  delegateAuthorized: boolean;
  next: "create-account" | "authorize-key" | "switch" | "done";
}

/** Server-level calls (not tied to an agent). */
export const server = {
  mode: () => request<{ mode: "local" | "hosted"; demo?: boolean }>("/api/mode").catch(() => ({ mode: "local" as const, demo: false })),
  stats: () => request<Stats>("/api/stats"),
  me: () => request<{ address: string | null }>("/api/auth/me"),
  challenge: (address: string) => request<{ nonce: string; message: string }>("/api/auth/challenge", { method: "POST", body: JSON.stringify({ address }) }),
  verify: (nonce: string, signature: string) => request<{ address: string }>("/api/auth/verify", { method: "POST", body: JSON.stringify({ nonce, signature }) }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
};

// ---- links to public explorers --------------------------------------------

export const links = {
  suiTx: (digest: string, network = "mainnet") => `https://suiscan.xyz/${network}/tx/${digest}`,
  suiObject: (id: string) => `https://suiscan.xyz/mainnet/object/${id}`,
  suiAccount: (a: string) => `https://suiscan.xyz/mainnet/account/${a}`,
  walrusBlob: (blobId: string) => `https://walruscan.com/mainnet/blob/${blobId}`,
};

// ---- formatting -------------------------------------------------------------

export const short = (s: string, n = 8) => (s.length > n + 2 ? `${s.slice(0, n)}…` : s);
export const middle = (s: string, a = 6, b = 4) => (s.length > a + b + 1 ? `${s.slice(0, a)}…${s.slice(-b)}` : s);
export const fmtDate = (ts: number) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
export const fmtTime = (ts: number) => new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
export const ago = (ts: number) => {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return fmtDate(ts);
};
export const keyOf = (b: Pick<Belief, "id" | "version">) => `${b.id}@${b.version}`;

/** Belief statements contain full 64-hex Sui addresses; shorten them for display. */
export const prettyStatement = (s: string) => s.replace(/0x[0-9a-fA-F]{20,}/g, (a) => middle(a, 8, 4));

/** Stable colour per tag. */
const PALETTE = ["#a78bfa", "#67e8f9", "#6ee7b7", "#fcd34d", "#fda4af", "#93c5fd", "#f0abfc", "#fdba74"];
export function tagColor(tag: string | undefined): string {
  if (!tag) return PALETTE[0]!;
  let h = 0;
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

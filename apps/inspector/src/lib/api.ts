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
}

export interface Summary {
  agent: string;
  publicKey: string;
  head: string | null;
  headCommit: Commit | null;
  namespaces: Record<string, string>;
  createdAt: number;
  counts: { episodes: number; forgotten: number; beliefs: number; beliefVersions: number; commits: number; receipts: number; pending: number };
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

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`/api/${path}`);
  const body = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
  return body;
}

export const api = {
  summary: () => get<Summary>("summary"),
  commits: () => get<CommitView[]>("commits"),
  state: (at?: string) => get<State>(`state${at ? `?at=${at}` : ""}`),
  episodes: () => get<EpisodeView[]>("episodes"),
  belief: (ref: string) => get<BlameView>(`belief/${encodeURIComponent(ref)}`),
  receipts: () => get<Receipt[]>("receipts"),
  verify: (ref: string, offline = false) => get<VerifyReport>(`verify/${encodeURIComponent(ref)}${offline ? "?offline=1" : ""}`),
};

// ---- links to public explorers --------------------------------------------

export const links = {
  suiTx: (digest: string) => `https://suiscan.xyz/mainnet/tx/${digest}`,
  suiObject: (id: string) => `https://suiscan.xyz/mainnet/object/${id}`,
  walrusBlob: (blobId: string) => `https://walruscan.com/mainnet/blob/${blobId}`,
};

// ---- formatting -------------------------------------------------------------

export const short = (s: string, n = 8) => (s.length > n + 2 ? `${s.slice(0, n)}…` : s);
export const middle = (s: string, a = 6, b = 4) => (s.length > a + b + 1 ? `${s.slice(0, a)}…${s.slice(-b)}` : s);
export const fmtDate = (ts: number) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
export const fmtTime = (ts: number) => new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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

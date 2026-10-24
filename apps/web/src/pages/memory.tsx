import { useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import { Bot, Database, Eraser, EyeOff, Loader2, Search, User, Wallet } from "lucide-react";
import { Empty, ErrorNote, Hash } from "@/components/engram/bits";
import { api, fmtTime, links, type EpisodeView } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import type { AppContext } from "./app-layout";

const ICON: Record<string, typeof User> = { user: User, tatum: Wallet, agent: Bot };
const FILTERS = ["all", "tatum", "user", "forgotten"] as const;

/** Every episode the agent has: what it saw, where it lives on Walrus, and a way to forget it. */
export function MemoryPage() {
  const ctx = useOutletContext<AppContext>();
  const [nonce, setNonce] = useState(0);
  const { data, error } = useApi(() => api.episodes(), [nonce]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [q, setQ] = useState("");
  const rows = useMemo(
    () =>
      (data ?? []).filter((e) => (filter === "all" ? true : filter === "forgotten" ? e.forgotten : e.source === filter && !e.forgotten)).filter((e) => !q || `${e.summary ?? ""} ${e.id}`.toLowerCase().includes(q.toLowerCase())),
    [data, filter, q],
  );

  if (error) return <ErrorNote message={error} />;
  return (
    <div className="space-y-6">
      <div>
        <div className="label"><span className="text-brand">●</span> episodes</div>
        <h1 className="mt-2 font-display text-5xl font-semibold tracking-[-0.05em]">Memory<span className="text-brand">.</span></h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Raw episodes — wallet events and what you told the agent. Each is encrypted with its own key; the ciphertext lives on Walrus. Forgetting destroys the key, so it can never be read again, and the next commit records a tombstone.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={cn("rounded-full border px-3 py-1 text-xs capitalize transition", filter === f ? "border-brand bg-brand font-medium text-ink" : "border-border text-muted-foreground hover:text-foreground")}>
            {f === "tatum" ? "wallet" : f === "user" ? "owner said" : f}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 rounded-full border border-border bg-white/[0.02] px-3 py-1.5 text-sm">
          <Search className="size-3.5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search episodes" className="w-44 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60" />
        </label>
      </div>
      {!data ? (
        <div className="h-64 animate-pulse rounded-2xl bg-white/[0.03]" />
      ) : rows.length === 0 ? (
        <Empty>No episodes here yet.</Empty>
      ) : (
        <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-2xl border border-border bg-surface-1">
          {rows.map((e) => (
            <Row key={e.id} e={e} canForget={!ctx.readOnly} onForgot={() => setNonce((n) => n + 1)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ e, canForget, onForgot }: { e: EpisodeView; canForget: boolean; onForgot: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const Icon = e.forgotten ? EyeOff : (ICON[e.source] ?? Database);
  const forget = async () => {
    setBusy(true);
    try {
      const r = await api.forget(e.id);
      setMsg(`Key destroyed.${r.retracted.length ? ` Retracted ${r.retracted.join(", ")}.` : ""}${r.revised.length ? ` Revised ${r.revised.join(", ")}.` : ""}`);
      onForgot();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };
  return (
    <li className={cn("flex flex-wrap items-center gap-4 px-4 py-3 transition hover:bg-white/[0.02]", e.forgotten && "opacity-60")}>
      <span className={cn("flex size-8 items-center justify-center rounded-lg border border-border", e.source === "user" ? "text-brand" : "text-brand-2")}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-sm", e.forgotten && "line-through")}>{e.forgotten ? "Forgotten episode" : (e.summary ?? (e.source === "user" ? "Owner message" : e.source))}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
          <span>{fmtTime(e.ts)}</span>
          <span className="font-mono">{e.id}</span>
          {e.blobId ? <span className="flex items-center gap-1">Walrus <Hash value={e.blobId} href={links.walrusBlob(e.blobId)} /></span> : !e.forgotten && <span className="text-warn/80">not pushed yet</span>}
          {!e.forgotten && <span className={e.consolidated ? "text-ok/80" : "text-muted-foreground"}>{e.consolidated ? "learned" : "awaiting sleep"}</span>}
        </div>
        {msg && <div className="mt-1 text-xs text-ok">{msg}</div>}
      </div>
      {canForget && !e.forgotten && (
        confirm ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Destroy its key forever?</span>
            <button type="button" disabled={busy} onClick={forget} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-destructive/90 px-3 text-xs font-medium text-foreground hover:bg-destructive">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Eraser className="size-3.5" />} Forget
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/12 px-3 text-xs text-muted-foreground transition hover:border-destructive/40 hover:text-destructive">
            <Eraser className="size-3.5" /> Forget
          </button>
        )
      )}
    </li>
  );
}

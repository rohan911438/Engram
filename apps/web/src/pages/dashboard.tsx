import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { ArrowRight, BellOff, BellRing, Brain, CircleCheck, CircleX, FileCheck2, GitCommitHorizontal, Layers, Loader2, MessageSquareText, Play, RefreshCw, Send, Sparkles, Wallet } from "lucide-react";
import { BorderBeam } from "@/components/ui/border-beam";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Confidence, ErrorNote, Hash } from "@/components/engram/bits";
import { VerifyPanel } from "@/components/engram/verify-panel";
import { api, ago, fmtTime, links, prettyStatement, tagColor, type Job, type JobKind, type Summary } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { LearningCurve } from "@/views/overview";
import type { AppContext } from "./app-layout";

export function DashboardPage() {
  const ctx = useOutletContext<AppContext>();
  const [nonce, setNonce] = useState(0);
  const refresh = () => setNonce((n) => n + 1);
  const summary = useApi(() => api.summary(), [nonce]);

  if (summary.error) return <ErrorNote message={summary.error} />;
  if (!summary.data) return <div className="h-64 animate-pulse rounded-3xl bg-white/[0.03]" />;
  const s = summary.data;
  const fresh = s.counts.episodes === 0;

  return (
    <div className="space-y-8">
      <Hero s={s} />
      {!ctx.readOnly && <Controls fresh={fresh} onChange={refresh} />}
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Decisions key={`d${nonce}`} />
        <div className="space-y-6">
          {!ctx.readOnly && <TellAgent onSent={refresh} />}
          <section className="rounded-2xl border border-white/[0.07] bg-[#08080b] p-5">
            <Title icon={GitCommitHorizontal} text="Learning curve" hint="beliefs per commit" />
            <LearningCurve key={`lc${nonce}`} />
          </section>
        </div>
      </div>
      <Beliefs key={`b${nonce}`} onOpen={ctx.openBelief} />
      {s.head && (
        <section className="rounded-2xl border border-white/[0.07] bg-[#08080b] p-5">
          <Title icon={FileCheck2} text="Verify current memory" hint="signature · Merkle · Walrus · Sui" />
          <VerifyPanel target="HEAD" />
        </section>
      )}
    </div>
  );
}

function Title({ icon: Icon, text, hint }: { icon: typeof Brain; text: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon className="size-4 text-[#a78bfa]" />
      <h2 className="text-sm font-medium">{text}</h2>
      {hint && <span className="ml-auto text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

// ---- hero ---------------------------------------------------------------------

function Hero({ s }: { s: Summary }) {
  const c = s.counts;
  const stats = [
    { icon: Brain, label: "Beliefs", value: c.beliefs, sub: `${c.beliefVersions} versions` },
    { icon: Layers, label: "Episodes", value: c.episodes, sub: `${c.pending} awaiting sleep` },
    { icon: GitCommitHorizontal, label: "Commits", value: c.commits, sub: "signed · anchored" },
    { icon: FileCheck2, label: "Decisions", value: c.receipts, sub: "with receipts" },
  ];
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#07070a] p-6 sm:p-8">
      <div className="pointer-events-none absolute -top-40 -right-20 size-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(124,92,255,0.22),transparent)]" />
      <div className="pointer-events-none absolute -bottom-48 left-10 size-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(34,211,238,0.12),transparent)]" />
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">agent</div>
          <h1 className="mt-2 bg-gradient-to-r from-white via-[#c4b5fd] to-[#67e8f9] bg-clip-text text-4xl font-semibold tracking-tight text-transparent">{s.agent}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">signing key <Hash value={s.publicKey} /></span>
            {s.headCommit && (
              <span>
                HEAD <span className="font-mono text-foreground">{s.headCommit.id.slice(0, 8)}</span> · {s.headCommit.manifest.message}
              </span>
            )}
          </div>
        </div>
        {s.headCommit?.anchor ? (
          <a href={links.suiTx(s.headCommit.anchor.txDigest, s.headCommit.anchor.network)} target="_blank" rel="noreferrer" className="group rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] px-4 py-3 text-xs transition hover:border-emerald-400/40">
            <div className="flex items-center gap-1.5 text-emerald-300"><CircleCheck className="size-3.5" /> Anchored on Sui</div>
            <div className="mt-1 font-mono text-foreground">checkpoint {Number(s.headCommit.anchor.checkpoint).toLocaleString("en-US")}{s.headCommit.anchor.network === "testnet" ? " · testnet" : ""}</div>
            <div className="mt-0.5 text-muted-foreground group-hover:text-foreground">{s.headCommit.anchor.timestampMs ? ago(s.headCommit.anchor.timestampMs) : ""} · view tx ↗</div>
          </a>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-muted-foreground">No commit yet</div>
        )}
      </div>
      <div className="relative mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((x) => (
          <div key={x.label} className="rounded-2xl border border-white/[0.06] bg-black/40 p-4 backdrop-blur">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><x.icon className="size-3.5" />{x.label}</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">{x.value > 0 ? <NumberTicker value={x.value} className="text-foreground" /> : 0}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{x.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- controls -------------------------------------------------------------------

const ACTIONS: { kind: JobKind; label: string; icon: typeof Play; hint: string }[] = [
  { kind: "sync", label: "Sync wallet", icon: Wallet, hint: "Read new transactions via Tatum and decide on each" },
  { kind: "learn", label: "Sleep", icon: Brain, hint: "Consolidate new episodes into beliefs" },
  { kind: "commit", label: "Commit", icon: GitCommitHorizontal, hint: "Sign, store on Walrus, anchor on Sui" },
];

function Controls({ fresh, onChange }: { fresh: boolean; onChange: () => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Pick up a job that's already running (e.g. after a refresh).
  useEffect(() => {
    api.jobs().then((j) => j.current && setJob(j.current)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!job || job.status !== "running") return;
    const t = setInterval(async () => {
      const next = await api.job(job.id).catch(() => null);
      if (next) {
        setJob(next);
        if (next.status !== "running") onChange();
      }
    }, 1200);
    return () => clearInterval(t);
  }, [job, onChange]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [job?.log.length]);

  const start = async (kind: JobKind) => {
    setError(null);
    try {
      setJob((await api.start(kind)).job);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const running = job?.status === "running";

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#07070a]">
      {running && <BorderBeam size={160} duration={5} colorFrom="#a78bfa" colorTo="#67e8f9" />}
      <div className="grid gap-0 lg:grid-cols-[1fr_1.1fr]">
        <div className="border-b border-white/[0.06] p-6 lg:border-r lg:border-b-0">
          <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4 text-[#a78bfa]" /> Run your agent</div>
          <p className="mt-2 text-sm text-muted-foreground">
            {fresh
              ? "Start here: the agent pulls your latest Sui transactions through Tatum, decides which ones it would alert you about, learns from them, and commits its memory to Walrus and Sui."
              : "Pull new transactions, let the agent learn from them and from what you've told it, then commit a new signed snapshot."}
          </p>
          <button type="button" disabled={running} onClick={() => start("run")} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-black shadow-[0_0_40px_-10px_rgba(167,139,250,0.8)] transition hover:bg-white/90 disabled:opacity-60">
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {running ? "Agent is working…" : fresh ? "Run my agent for the first time" : "Run agent"}
          </button>
          <div className="mt-5 flex flex-wrap gap-2">
            {ACTIONS.map((a) => (
              <button key={a.kind} type="button" title={a.hint} disabled={running} onClick={() => start(a.kind)} className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 text-xs text-muted-foreground transition hover:bg-white/[0.07] hover:text-foreground disabled:opacity-50">
                <a.icon className="size-3.5" /> {a.label}
              </button>
            ))}
          </div>
          {error && <div className="mt-4 text-sm text-destructive">{error}</div>}
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-mono tracking-wider uppercase">activity</span>
            {job && (
              <span className={cn("flex items-center gap-1.5", job.status === "done" && "text-emerald-300", job.status === "failed" && "text-destructive")}>
                {job.status === "running" ? <Loader2 className="size-3 animate-spin" /> : job.status === "done" ? <CircleCheck className="size-3" /> : <CircleX className="size-3" />}
                {job.kind} · {job.status}
              </span>
            )}
          </div>
          <div ref={logRef} className="mt-3 h-44 space-y-1.5 overflow-y-auto rounded-xl border border-white/[0.05] bg-black/60 p-3 font-mono text-[12px]">
            {!job && <div className="text-muted-foreground">Nothing running. Press “Run agent”.</div>}
            {job?.log.map((l, i) => (
              <div key={i} className="flex gap-3">
                <span className="shrink-0 text-muted-foreground/60">{new Date(l.ts).toLocaleTimeString("en-US", { hour12: false })}</span>
                <span className={cn(l.text.startsWith("failed") ? "text-destructive" : "text-foreground/90")}>{l.text}</span>
              </div>
            ))}
            {job?.status === "running" && <span className="inline-block h-3.5 w-1.5 animate-pulse bg-white/60" />}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---- tell the agent ----------------------------------------------------------------

const EXAMPLES = ["The weekly transfer to my exchange is normal.", "Never let anyone move more than 500 USDC without alerting me.", "I'm travelling next week — expect payments abroad."];

function TellAgent({ onSent }: { onSent: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await api.tell(text);
      setText("");
      setNote({ ok: true, text: `Saved as episode ${r.episode.id} (encrypted). It shapes beliefs at the next sleep.` });
      onSent();
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#08080b] p-5">
      <Title icon={MessageSquareText} text="Tell your agent" hint="owner's word beats patterns" />
      <div className="rounded-xl border border-white/[0.08] bg-black/60 focus-within:border-[#a78bfa]/50">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder="e.g. The 450 USDC I send on the 1st is my rent." className="w-full resize-none bg-transparent p-3 text-sm outline-none placeholder:text-muted-foreground/60" />
        <div className="flex items-center justify-between border-t border-white/[0.06] px-3 py-2">
          <span className="text-[11px] text-muted-foreground">{text.length}/2000</span>
          <button type="button" disabled={busy || !text.trim()} onClick={send} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3.5 text-xs font-medium text-black disabled:opacity-40">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Send
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {EXAMPLES.map((e) => (
          <button key={e} type="button" onClick={() => setText(e)} className="rounded-full border border-white/[0.07] px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-white/15 hover:text-foreground">{e}</button>
        ))}
      </div>
      {note && <div className={cn("mt-3 text-xs", note.ok ? "text-emerald-300" : "text-destructive")}>{note.text}</div>}
    </section>
  );
}

// ---- decisions ------------------------------------------------------------------------

function parseAction(a: string) {
  const m = /^(ALERT\[(\w+)\]|no alert): (.*?)(?: — (.*))?$/.exec(a);
  if (!m) return { alert: false, severity: null as string | null, what: a, why: "" };
  return { alert: m[1] !== "no alert", severity: m[2] ?? null, what: m[3] ?? "", why: m[4] ?? "" };
}

function Decisions() {
  const { data, error } = useApi(() => api.receipts(), []);
  const ctx = useOutletContext<AppContext>();
  const base = ctx.source === "demo" ? "/demo" : "/app";
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#08080b] p-5">
      <Title icon={BellRing} text="Latest decisions" hint="each one signed, with the beliefs it used" />
      {error && <ErrorNote message={error} />}
      {data && data.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-muted-foreground">
          No decisions yet. Decisions get receipts once the agent has a commit — run the agent twice: first to learn, then to judge new activity.
        </div>
      )}
      <ul className="space-y-2">
        {data?.slice(0, 7).map((r) => {
          const p = parseAction(r.action);
          return (
            <li key={r.id} className="group rounded-xl border border-white/[0.05] bg-black/40 p-3 transition hover:border-white/12">
              <div className="flex items-center gap-2.5">
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", p.alert ? (p.severity === "critical" ? "bg-red-500/15 text-red-300" : "bg-amber-400/15 text-amber-300") : "bg-emerald-400/10 text-emerald-300")}>
                  {p.alert ? <BellRing className="size-3.5" /> : <BellOff className="size-3.5" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{prettyStatement(p.what)}</span>
                {p.severity && <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px] uppercase", p.severity === "critical" ? "bg-red-500/15 text-red-300" : p.severity === "warn" ? "bg-amber-400/15 text-amber-300" : "bg-cyan-400/10 text-cyan-300")}>{p.severity}</span>}
                <span className="shrink-0 text-[11px] text-muted-foreground">{fmtTime(r.ts)}</span>
              </div>
              {p.why && <p className="mt-1.5 line-clamp-2 pl-[38px] text-xs text-muted-foreground">{p.why}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[38px]">
                {r.beliefs.map((b) => (
                  <button key={b} type="button" onClick={() => ctx.openBelief(b)} className="rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground">{b.replace(/^b_/, "")}</button>
                ))}
                <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">{r.id}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {data && data.length > 7 && (
        <Link to={`${base}/receipts`} className="mt-3 inline-flex items-center gap-1 text-xs text-[#c4b5fd] hover:text-white">All {data.length} decisions <ArrowRight className="size-3" /></Link>
      )}
    </section>
  );
}

// ---- beliefs ---------------------------------------------------------------------------

function Beliefs({ onOpen }: { onOpen: (ref: string) => void }) {
  const { data } = useApi(() => api.state(), []);
  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Brain className="size-4 text-[#a78bfa]" />
        <h2 className="text-sm font-medium">What your agent believes</h2>
        <span className="ml-auto text-xs text-muted-foreground">click for evidence</span>
      </div>
      {data && data.beliefs.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-muted-foreground">No beliefs yet — run the agent, or tell it something and press Sleep.</div>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data?.beliefs
          .sort((a, b) => b.confidence - a.confidence)
          .map((b) => (
            <button key={b.id} type="button" onClick={() => onOpen(`${b.id}@${b.version}`)} className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#08080b] p-4 text-left transition hover:-translate-y-0.5 hover:border-white/15">
              <span className="absolute inset-x-0 top-0 h-px opacity-70" style={{ background: `linear-gradient(90deg, transparent, ${tagColor(b.tags[0])}, transparent)` }} />
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: tagColor(b.tags[0]) }} />
                <span className="font-mono text-[11px] text-muted-foreground">{b.id}@{b.version}</span>
                <Confidence value={b.confidence} className="ml-auto" />
              </div>
              <div className="mt-2.5 text-sm leading-snug">{prettyStatement(b.statement)}</div>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{b.evidence.length} evidence</span>·<span>{b.tags.join(", ")}</span>
                <RefreshCw className="ml-auto size-3 opacity-0 transition group-hover:opacity-60" />
              </div>
            </button>
          ))}
      </div>
    </section>
  );
}

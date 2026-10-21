import { Activity, Brain, FileCheck2, GitCommitHorizontal, Layers, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Confidence, ErrorNote, Hash, SectionTitle } from "@/components/engram/bits";
import { VerifyPanel } from "@/components/engram/verify-panel";
import { api, fmtTime, links, prettyStatement, tagColor, type Summary } from "@/lib/api";
import { useApi } from "@/lib/use-api";

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Brain; label: string; value: number | string; sub?: string }) {
  return (
    <Card className="gap-2 py-4">
      <CardContent className="px-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </div>
        <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

/** Beliefs per commit, as a small area chart — the learning curve. */
function LearningCurve() {
  const { data } = useApi(() => api.commits(), []);
  if (!data || data.length === 0) return <div className="h-32 text-sm text-muted-foreground">No commits yet.</div>;
  const pts = [...data].reverse().map((c) => ({ n: c.manifest.beliefs.length, changes: c.diff.added.length + c.diff.changed.length + c.diff.removed.length, label: c.manifest.message }));
  const W = 560;
  const H = 120;
  const max = Math.max(...pts.map((p) => p.n), 1);
  const x = (i: number) => (pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * (W - 24) + 12);
  const y = (n: number) => H - 14 - (n / max) * (H - 34);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.n)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full">
      <defs>
        <linearGradient id="lc" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${x(pts.length - 1)},${H - 14} L${x(0)},${H - 14} Z`} fill="url(#lc)" />
      <path d={line} fill="none" stroke="var(--color-brand)" strokeWidth="2" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.n)} r="4" fill="var(--background)" stroke="var(--color-brand)" strokeWidth="2">
            <title>{`${p.label}: ${p.n} beliefs, ${p.changes} changes`}</title>
          </circle>
          <text x={x(i)} y={y(p.n) - 10} textAnchor="middle" className="fill-muted-foreground text-[10px]">{p.n}</text>
        </g>
      ))}
    </svg>
  );
}

export function OverviewView({ summary, onOpenBelief }: { summary: Summary; onOpenBelief: (ref: string) => void }) {
  const state = useApi(() => api.state(), []);
  const c = summary.counts;
  const head = summary.headCommit;
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-card to-card p-6 glow">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-xs tracking-widest text-muted-foreground uppercase">Agent</div>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight"><span className="text-gradient">{summary.agent}</span></h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Lock className="size-3.5" /> signing key <Hash value={summary.publicKey} /></span>
              {head && <span className="flex items-center gap-1.5"><GitCommitHorizontal className="size-3.5" /> HEAD <span className="font-mono text-foreground">{head.id.slice(0, 8)}</span> {head.manifest.message}</span>}
            </div>
          </div>
          {head?.anchor && (
            <div className="rounded-xl border bg-background/50 px-4 py-3 text-xs backdrop-blur">
              <div className="text-muted-foreground">Last anchored on Sui</div>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="outline" className="border-ok/40 text-ok">checkpoint {Number(head.anchor.checkpoint).toLocaleString("en-US")}</Badge>
                <Hash value={head.anchor.txDigest} href={links.suiTx(head.anchor.txDigest)} />
              </div>
              {head.anchor.timestampMs ? <div className="mt-1 text-muted-foreground">{fmtTime(head.anchor.timestampMs)}</div> : null}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat icon={Brain} label="Active beliefs" value={c.beliefs} sub={`${c.beliefVersions} versions total`} />
        <Stat icon={Layers} label="Episodes" value={c.episodes} sub={`${c.pending} awaiting sleep · ${c.forgotten} forgotten`} />
        <Stat icon={GitCommitHorizontal} label="Commits" value={c.commits} sub="signed + anchored" />
        <Stat icon={FileCheck2} label="Receipts" value={c.receipts} sub="provable decisions" />
        <Stat icon={Activity} label="Walrus namespaces" value={Object.keys(summary.namespaces).length} sub={summary.namespaces.episodes?.replace(/-episodes$/, "-*")} />
      </section>

      <section className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Learning curve</CardTitle>
            <div className="text-xs text-muted-foreground">Active beliefs at each commit</div>
          </CardHeader>
          <CardContent><LearningCurve /></CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Verify HEAD</CardTitle>
            <div className="text-xs text-muted-foreground">Proves the current memory is untampered</div>
          </CardHeader>
          <CardContent>{summary.head ? <VerifyPanel target="HEAD" /> : <div className="text-sm text-muted-foreground">Nothing committed yet.</div>}</CardContent>
        </Card>
      </section>

      <section>
        <SectionTitle hint="click a belief for its evidence">What the agent believes now</SectionTitle>
        {state.error && <ErrorNote message={state.error} />}
        {!state.data ? (
          <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {state.data.beliefs
              .sort((a, b) => b.confidence - a.confidence)
              .map((b) => (
                <button key={b.id} type="button" onClick={() => onOpenBelief(`${b.id}@${b.version}`)} className="group rounded-xl border bg-card p-4 text-left transition hover:border-primary/40 hover:bg-accent/40">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: tagColor(b.tags[0]) }} />
                    <span className="font-mono text-[11px] text-muted-foreground">{b.id}@{b.version}</span>
                    <Confidence value={b.confidence} className="ml-auto" />
                  </div>
                  <div className="mt-2 text-sm leading-snug">{prettyStatement(b.statement)}</div>
                  <div className="mt-2 text-xs text-muted-foreground">{b.evidence.length} evidence · {b.tags.join(", ")}</div>
                </button>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}

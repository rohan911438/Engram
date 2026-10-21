import { useEffect, useMemo, useState } from "react";
import { Background, BackgroundVariant, Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Brain, EyeOff, Pause, Play, User, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { BeliefSheet } from "@/components/engram/belief-sheet";
import { Confidence, Empty, ErrorNote } from "@/components/engram/bits";
import { api, fmtDate, keyOf, prettyStatement, tagColor, type Belief, type EpisodeView, type State } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

type Change = "new" | "changed" | "same";

type BeliefData = { belief: Belief; change: Change; onOpen: (ref: string) => void };
type EpisodeData = { episode: EpisodeView };
type CoreData = { agent: string; count: number };

function BeliefNode({ data }: NodeProps<Node<BeliefData>>) {
  const { belief, change } = data;
  const color = tagColor(belief.tags[0]);
  return (
    <button
      type="button"
      onClick={() => data.onOpen(keyOf(belief))}
      className={cn(
        "w-64 rounded-xl border bg-card/95 p-3 text-left shadow-lg backdrop-blur transition hover:border-primary/50 hover:shadow-primary/10",
        change === "new" && "ring-2 ring-ok/70 shadow-ok/20",
        change === "changed" && "ring-2 ring-warn/70 shadow-warn/20",
      )}
      style={{ borderTopColor: color, borderTopWidth: 3 }}
    >
      <Handle type="target" position={Position.Top} className="!size-1.5 !border-0 !bg-muted-foreground/50" />
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="font-mono text-[10px] text-muted-foreground">{belief.id.replace(/^b_/, "")}</span>
        <span className="font-mono text-[10px] text-muted-foreground">v{belief.version}</span>
        {change !== "same" && <Badge className={cn("ml-auto h-4 px-1.5 text-[10px]", change === "new" ? "bg-ok/20 text-ok" : "bg-warn/20 text-warn")}>{change}</Badge>}
      </div>
      <div className="line-clamp-3 text-[13px] leading-snug">{prettyStatement(belief.statement)}</div>
      <div className="mt-2 flex items-center justify-between">
        <Confidence value={belief.confidence} />
        <span className="text-[10px] text-muted-foreground">{belief.evidence.length} evidence</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!size-1.5 !border-0 !bg-muted-foreground/50" />
    </button>
  );
}

function EpisodeNode({ data }: NodeProps<Node<EpisodeData>>) {
  const e = data.episode;
  const Icon = e.forgotten ? EyeOff : e.source === "user" ? User : Wallet;
  return (
    <div className={cn("flex max-w-52 items-center gap-1.5 rounded-full border bg-background/90 px-2.5 py-1 text-[11px] text-muted-foreground shadow", e.forgotten && "border-dashed line-through opacity-60")}>
      <Handle type="source" position={Position.Top} className="!size-1 !border-0 !bg-transparent" />
      <Icon className={cn("size-3 shrink-0", e.source === "user" ? "text-brand" : "text-brand-2")} />
      <span className="truncate">{e.forgotten ? "forgotten" : (e.summary ?? e.source)}</span>
      <span className="shrink-0 opacity-60">{fmtDate(e.ts).replace(/, \d{4}$/, "")}</span>
    </div>
  );
}

function CoreNode({ data }: NodeProps<Node<CoreData>>) {
  return (
    <div className="flex size-28 flex-col items-center justify-center rounded-full border border-primary/40 bg-gradient-to-br from-primary/25 to-brand-2/10 text-center glow">
      <Brain className="size-6 text-primary" />
      <div className="mt-1 text-xs font-medium">{data.agent}</div>
      <div className="text-[10px] text-muted-foreground">{data.count} beliefs</div>
      <Handle type="source" position={Position.Top} className="!opacity-0" />
    </div>
  );
}

const nodeTypes = { belief: BeliefNode, episode: EpisodeNode, core: CoreNode };

/** Radial layout: agent in the middle, beliefs on a ring, each belief's evidence fanned out behind it. */
function layout(state: State, prev: State | null, agent: string, onOpen: (r: string) => void) {
  const prevVersions = new Map((prev?.beliefs ?? []).map((b) => [b.id, b.version]));
  const beliefs = [...state.beliefs].sort((a, b) => (a.tags[0] ?? "").localeCompare(b.tags[0] ?? "") || a.id.localeCompare(b.id));
  const eps = new Map(state.episodes.map((e) => [e.id, e]));
  const nodes: Node[] = [{ id: "core", type: "core", position: { x: -56, y: -56 }, data: { agent, count: beliefs.length }, draggable: false }];
  const edges: Edge[] = [];
  const n = Math.max(beliefs.length, 1);
  const R = Math.max(250, n * 58);
  const placed = new Set<string>();
  beliefs.forEach((b, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * R;
    const y = Math.sin(angle) * R;
    const change: Change = !prev ? "same" : !prevVersions.has(b.id) ? "new" : prevVersions.get(b.id) !== b.version ? "changed" : "same";
    nodes.push({ id: b.id, type: "belief", position: { x: x - 128, y: y - 55 }, data: { belief: b, change, onOpen } });
    edges.push({ id: `core-${b.id}`, source: "core", target: b.id, style: { stroke: tagColor(b.tags[0]), strokeOpacity: 0.35, strokeWidth: 1.5 } });
    const own = b.evidence.filter((id) => eps.has(id) && !placed.has(id)).slice(0, 5);
    own.forEach((id, j) => {
      placed.add(id);
      const spread = 0.16 * (j - (own.length - 1) / 2);
      const r2 = R + 175 + (j % 2) * 40;
      nodes.push({ id, type: "episode", position: { x: Math.cos(angle + spread) * r2 - 70, y: Math.sin(angle + spread) * r2 - 12 }, data: { episode: eps.get(id)! } });
    });
    for (const id of b.evidence) {
      if (!placed.has(id)) continue;
      edges.push({ id: `${id}-${b.id}`, source: id, target: b.id, animated: change !== "same", style: { stroke: "var(--muted-foreground)", strokeOpacity: 0.25 } });
    }
  });
  return { nodes, edges };
}

export function MindView({ agent }: { agent: string }) {
  const commits = useApi(() => api.commits(), []);
  const timeline = useMemo(() => [...(commits.data ?? [])].reverse(), [commits.data]); // oldest → newest
  const [pos, setPos] = useState<number | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [prev, setPrev] = useState<State | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Positions: 0..commits-1 are commits, last is "working" (uncommitted) beliefs.
  const last = timeline.length;
  const at = pos ?? last;
  const commitAt = at < timeline.length ? timeline[at] : undefined;

  useEffect(() => {
    if (!commits.data) return;
    let stale = false;
    const ref = at < timeline.length ? timeline[at]!.id : undefined;
    const prevRef = at > 0 ? (at - 1 < timeline.length ? timeline[at - 1]!.id : undefined) : null;
    Promise.all([api.state(ref), prevRef === null ? Promise.resolve(null) : api.state(prevRef)])
      .then(([s, p]) => {
        if (stale) return;
        setState(s);
        setPrev(p);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      stale = true;
    };
  }, [at, commits.data, timeline]);

  useEffect(() => {
    if (!playing) return;
    if (at >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setPos(at + 1), 1600);
    return () => clearTimeout(t);
  }, [playing, at, last]);

  const graph = useMemo(() => (state ? layout(state, prev, agent, setOpen) : null), [state, prev, agent]);

  if (commits.error || error) return <ErrorNote message={commits.error ?? error!} />;
  const changes = graph ? graph.nodes.filter((n) => n.type === "belief" && (n.data as BeliefData).change !== "same").length : 0;

  return (
    <div className="flex h-full flex-col gap-4">
      <Card className="flex min-h-20 flex-row items-center gap-4 px-4 py-4">
        <Button
          size="icon"
          variant="secondary"
          onClick={() => {
            if (at >= last) setPos(0);
            setPlaying((p) => !p);
          }}
          disabled={timeline.length === 0}
          aria-label={playing ? "pause" : "play history"}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <div className="min-w-0 flex-1">
          <Slider min={0} max={Math.max(last, 1)} step={1} value={[at]} onValueChange={(v) => { setPlaying(false); setPos(Array.isArray(v) ? (v[0] ?? 0) : v); }} disabled={timeline.length === 0} />
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            {timeline.map((c, i) => (
              <span key={c.id} className={cn("truncate", i === at && "text-foreground")}>{c.manifest.message.split(":")[0]}</span>
            ))}
            <span className={cn("shrink-0", at === last && "text-foreground")}>working</span>
          </div>
        </div>
        <div className="w-72 shrink-0 text-right">
          <div className="truncate text-sm font-medium">{commitAt ? commitAt.manifest.message : "Working memory"}</div>
          <div className="text-xs text-muted-foreground">
            {commitAt ? <span className="font-mono">{commitAt.id.slice(0, 8)}</span> : "uncommitted beliefs"}
            {changes > 0 && <span className="ml-2 text-warn">{changes} change{changes === 1 ? "" : "s"}</span>}
          </div>
        </div>
      </Card>

      <Card className="relative min-h-[560px] flex-1 overflow-hidden p-0">
        {!graph ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading the mind…</div>
        ) : graph.nodes.length <= 1 ? (
          <div className="p-10"><Empty>No beliefs yet. Observe some episodes and run <code className="font-mono">engram sleep</code>.</Empty></div>
        ) : (
          <ReactFlow
            key={at}
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.04 }}
            minZoom={0.2}
            proOptions={{ hideAttribution: true }}
            colorMode="dark"
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="oklch(1 0 0 / 12%)" />
            <Controls showInteractive={false} position="bottom-right" />
          </ReactFlow>
        )}
        <div className="pointer-events-none absolute top-3 left-3 flex gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-ok" /> new</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-warn" /> revised</span>
          <span className="flex items-center gap-1"><Wallet className="size-3 text-brand-2" /> wallet event</span>
          <span className="flex items-center gap-1"><User className="size-3 text-brand" /> owner said</span>
        </div>
      </Card>
      <BeliefSheet beliefRef={open} onClose={() => setOpen(null)} />
    </div>
  );
}

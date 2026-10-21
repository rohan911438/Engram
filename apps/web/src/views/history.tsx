import { useState } from "react";
import { ChevronDown, GitCommitHorizontal, Minus, Pencil, Plus, Skull } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, ErrorNote, Hash } from "@/components/engram/bits";
import { VerifyPanel } from "@/components/engram/verify-panel";
import { api, fmtTime, links } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

const label = (k: string) => k.replace(/^b_/, "").replace(/@\d+$/, "").replaceAll("_", " ");

export function HistoryView({ onOpenBelief }: { onOpenBelief: (ref: string) => void }) {
  const { data, error } = useApi(() => api.commits(), []);
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>;
  if (data.length === 0) return <Empty>No commits yet — run <code className="font-mono">engram commit -m "…"</code>.</Empty>;

  return (
    <ol className="relative space-y-4 border-l border-border/70 pl-8">
      {data.map((c, i) => {
        const m = c.manifest;
        const isOpen = open === c.id;
        return (
          <li key={c.id} className="relative">
            <span className={cn("absolute top-5 -left-[41px] flex size-5 items-center justify-center rounded-full border bg-background", i === 0 && "border-primary text-primary")}>
              <GitCommitHorizontal className="size-3" />
            </span>
            <Card className="gap-0 py-0">
              <button type="button" onClick={() => setOpen(isOpen ? null : c.id)} className="flex w-full items-start gap-4 p-4 text-left">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.message}</span>
                    {i === 0 && <Badge className="bg-primary/20 text-primary">HEAD</Badge>}
                    {m.tombstones.length > 0 && <Badge variant="outline" className="gap-1"><Skull className="size-3" />{m.tombstones.length} forgotten</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-mono">{c.id.slice(0, 8)}</span>
                    <span>{fmtTime(m.ts)}</span>
                    <span>{m.beliefs.length} beliefs</span>
                    <span className="font-mono">root {m.merkleRoot.slice(0, 10)}…</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {c.diff.added.map((k) => (
                      <Chip key={k} kind="added" onClick={(e) => { e.stopPropagation(); onOpenBelief(k); }}>{label(k)}</Chip>
                    ))}
                    {c.diff.changed.map(([, k]) => (
                      <Chip key={k} kind="changed" onClick={(e) => { e.stopPropagation(); onOpenBelief(k); }}>{label(k)} v{k.split("@")[1]}</Chip>
                    ))}
                    {c.diff.removed.map((k) => (
                      <Chip key={k} kind="removed" onClick={(e) => { e.stopPropagation(); onOpenBelief(k); }}>{label(k)}</Chip>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                  {c.anchor ? (
                    <>
                      <Badge variant="outline" className="border-ok/40 text-ok">anchored · checkpoint {Number(c.anchor.checkpoint).toLocaleString("en-US")}</Badge>
                      <span onClick={(e) => e.stopPropagation()}><Hash value={c.anchor.txDigest} href={links.suiTx(c.anchor.txDigest)} /></span>
                    </>
                  ) : (
                    <Badge variant="outline" className="text-warn">not anchored</Badge>
                  )}
                  {c.manifestBlobId && <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-muted-foreground">manifest <Hash value={c.manifestBlobId} href={links.walrusBlob(c.manifestBlobId)} /></span>}
                  <ChevronDown className={cn("mt-1 size-4 text-muted-foreground transition", isOpen && "rotate-180")} />
                </div>
              </button>
              {isOpen && (
                <div className="border-t p-4 animate-in fade-in slide-in-from-top-1">
                  <VerifyPanel target={c.id} autoRun />
                </div>
              )}
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

function Chip({ kind, children, onClick }: { kind: "added" | "changed" | "removed"; children: React.ReactNode; onClick: (e: React.MouseEvent) => void }) {
  const Icon = kind === "added" ? Plus : kind === "changed" ? Pencil : Minus;
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition hover:brightness-125",
        kind === "added" && "border-ok/30 bg-ok/10 text-ok",
        kind === "changed" && "border-warn/30 bg-warn/10 text-warn",
        kind === "removed" && "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      <Icon className="size-3" />
      {children}
    </span>
  );
}

import { Bot, Database, EyeOff, GitCommitVertical, User, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api, fmtTime, links, prettyStatement, tagColor } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { Confidence, ErrorNote, Hash } from "./bits";

const SOURCE_ICON: Record<string, typeof User> = { user: User, tatum: Wallet, agent: Bot, tool: Database, system: Database };

/** Side panel: one belief, its version history, and the episodes behind it (blame). */
export function BeliefSheet({ beliefRef, onClose }: { beliefRef: string | null; onClose: () => void }) {
  return (
    <Sheet open={!!beliefRef} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-xl">{beliefRef && <Body beliefRef={beliefRef} />}</SheetContent>
    </Sheet>
  );
}

function Body({ beliefRef }: { beliefRef: string }) {
  const { data, error, loading } = useApi(() => api.belief(beliefRef), [beliefRef]);
  if (error) return <div className="p-6"><ErrorNote message={error} /></div>;
  if (loading || !data) return <div className="space-y-3 p-6"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div>;
  const { belief, history, evidence } = data;
  const tag = belief.tags[0];
  return (
    <ScrollArea className="h-full">
      <SheetHeader className="space-y-3 p-6 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{belief.id}@{belief.version}</span>
          {belief.tags.map((t) => (
            <Badge key={t} variant="outline" style={{ borderColor: `${tagColor(t)}55`, color: tagColor(t) }}>{t}</Badge>
          ))}
          {belief.status === "retracted" && <Badge variant="destructive">retracted</Badge>}
        </div>
        <SheetTitle className="text-lg leading-snug font-medium">{prettyStatement(belief.statement)}</SheetTitle>
        <SheetDescription render={<div />} className="flex items-center gap-4">
          <Confidence value={belief.confidence} />
          {belief.blobId && <Hash value={belief.blobId} href={links.walrusBlob(belief.blobId)} />}
        </SheetDescription>
        {belief.reason && <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">“{belief.reason}”</p>}
      </SheetHeader>

      <Separator />
      <section className="p-6">
        <h3 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Evidence · {evidence.length} episode{evidence.length === 1 ? "" : "s"}</h3>
        <ol className="space-y-2">
          {evidence.map(({ episode, content }) => {
            const Icon = episode.forgotten ? EyeOff : (SOURCE_ICON[episode.source] ?? Database);
            return (
              <li key={episode.id} className={cn("rounded-xl border bg-card/60 p-3", episode.forgotten && "border-dashed opacity-70")}>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon className="size-3.5" />
                  <span className="font-medium text-foreground">{episode.source}</span>
                  <span>{fmtTime(episode.ts)}</span>
                  <span className="ml-auto font-mono">{episode.id}</span>
                </div>
                <div className="mt-2 text-sm">
                  {content ? <EpisodeData data={content.data} /> : <span className="text-muted-foreground italic">Forgotten — its key was destroyed, so it can never be decrypted again.</span>}
                </div>
                {episode.blobId && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    Walrus blob <Hash value={episode.blobId} href={links.walrusBlob(episode.blobId)} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {history.length > 1 && (
        <>
          <Separator />
          <section className="p-6">
            <h3 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">History</h3>
            <ol className="relative space-y-4 border-l pl-5">
              {history.map((h) => (
                <li key={h.version} className="relative">
                  <GitCommitVertical className="absolute top-0.5 -left-[29px] size-4 rounded-full bg-background" style={{ color: tagColor(tag) }} />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">v{h.version}</span>
                    <span>{fmtTime(h.createdAt)}</span>
                    <Confidence value={h.confidence} className="ml-auto" />
                  </div>
                  <div className={cn("mt-1 text-sm", h.status === "retracted" && "line-through opacity-60")}>{prettyStatement(h.statement)}</div>
                  {h.reason && <div className="mt-1 text-xs text-muted-foreground">{h.reason}</div>}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </ScrollArea>
  );
}

function EpisodeData({ data }: { data: unknown }) {
  if (typeof data === "string") return <span>“{data}”</span>;
  if (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string") return <span>“{(data as { message: string }).message}”</span>;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.amount === "number" && typeof d.coin === "string") {
      const cp = typeof d.counterparty === "string" ? d.counterparty : null;
      return (
        <span className="flex flex-wrap items-center gap-x-2">
          <span className={d.direction === "in" ? "text-ok" : ""}>{d.direction === "in" ? "+" : "−"}{d.amount} {d.coin}</span>
          {cp && <span className="text-muted-foreground">{d.direction === "in" ? "from" : "to"} <Hash value={cp} a={8} b={4} /></span>}
          {d.kind === "swap" && <Badge variant="secondary">swap</Badge>}
        </span>
      );
    }
  }
  return <code className="block overflow-x-auto rounded bg-muted/50 p-2 font-mono text-xs">{JSON.stringify(data)}</code>;
}

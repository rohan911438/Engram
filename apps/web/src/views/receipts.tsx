import { useMemo, useState } from "react";
import { BellRing, BellOff, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, ErrorNote, Hash } from "@/components/engram/bits";
import { VerifyPanel } from "@/components/engram/verify-panel";
import { api, fmtTime, prettyStatement, type Receipt } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

/** "ALERT[critical]: sent 1800 USDC — message" → parts. */
function parseAction(a: string) {
  const m = /^(ALERT\[(\w+)\]|no alert): (.*?)(?: — (.*))?$/.exec(a);
  if (!m) return { alert: null as boolean | null, severity: null as string | null, what: a, why: "" };
  return { alert: m[1] !== "no alert", severity: m[2] ?? null, what: m[3] ?? "", why: m[4] ?? "" };
}

const SEV: Record<string, string> = { info: "border-brand-2/40 text-brand-2", warn: "border-warn/40 text-warn", critical: "border-destructive/50 bg-destructive/15 text-destructive" };

export function ReceiptsView({ onOpenBelief }: { onOpenBelief: (ref: string) => void }) {
  const { data, error } = useApi(() => api.receipts(), []);
  const [sel, setSel] = useState<Receipt | null>(null);
  const [q, setQ] = useState("");
  const rows = useMemo(() => (data ?? []).filter((r) => !q || r.action.toLowerCase().includes(q.toLowerCase())), [data, q]);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Skeleton className="h-64" />;
  if (data.length === 0)
    return (
      <Empty>
        No decisions recorded yet. A receipt is created each time the agent makes a decision, with{" "}
        <code className="font-mono">mind.wrap()</code> in the SDK or <code className="font-mono">engram decide</code> in the CLI.
      </Empty>
    );
  const alerts = data.filter((r) => parseAction(r.action).alert).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm text-muted-foreground">
          <span className="text-foreground">{data.length}</span> decisions · <span className="text-foreground">{alerts}</span> alerts · each one signed and tied to a commit
        </div>
        <label className="ml-auto flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm">
          <Search className="size-3.5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter decisions" className="w-48 bg-transparent outline-none placeholder:text-muted-foreground" />
        </label>
      </div>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">When</TableHead>
              <TableHead>Decision</TableHead>
              <TableHead>Beliefs used</TableHead>
              <TableHead className="w-28 text-right">Commit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const p = parseAction(r.action);
              return (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setSel(r)}>
                  <TableCell className="text-xs text-muted-foreground">{fmtTime(r.ts)}</TableCell>
                  <TableCell className="max-w-xl whitespace-normal">
                    <div className="flex items-center gap-2">
                      {p.alert ? <BellRing className="size-3.5 shrink-0 text-warn" /> : <BellOff className="size-3.5 shrink-0 text-ok" />}
                      {p.severity && <Badge variant="outline" className={cn("uppercase", SEV[p.severity])}>{p.severity}</Badge>}
                      <span className="font-medium">{prettyStatement(p.what)}</span>
                    </div>
                    {p.why && <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{p.why}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.beliefs.length === 0 && <span className="text-xs text-muted-foreground">none</span>}
                      {r.beliefs.map((b) => (
                        <Badge key={b} variant="secondary" className="cursor-pointer font-mono" onClick={(e) => { e.stopPropagation(); onOpenBelief(b); }}>{b.replace(/^b_/, "")}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.commitId.slice(0, 8)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent className="w-full gap-0 p-0 sm:max-w-xl">
          {sel && (
            <ScrollArea className="h-full">
              <SheetHeader className="space-y-2 p-6">
                <div className="font-mono text-xs text-muted-foreground">{sel.id}</div>
                <SheetTitle className="text-lg leading-snug font-medium">{prettyStatement(parseAction(sel.action).what)}</SheetTitle>
                <SheetDescription>{parseAction(sel.action).why}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-6 pb-6">
                <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Decided</dt><dd>{fmtTime(sel.ts)}</dd>
                  <dt className="text-muted-foreground">Commit</dt><dd><Hash value={sel.commitId} a={10} b={6} /></dd>
                  <dt className="text-muted-foreground">Input hash</dt><dd><Hash value={sel.inputHash} a={10} b={6} /></dd>
                  <dt className="text-muted-foreground">Signature</dt><dd><Hash value={sel.signature} a={10} b={6} /></dd>
                  <dt className="text-muted-foreground">Beliefs</dt>
                  <dd className="flex flex-wrap gap-1">
                    {sel.beliefs.length === 0 ? <span className="text-muted-foreground">none</span> : sel.beliefs.map((b) => <Badge key={b} variant="secondary" className="cursor-pointer font-mono" onClick={() => onOpenBelief(b)}>{b}</Badge>)}
                  </dd>
                  <dt className="text-muted-foreground">Merkle proofs</dt><dd>{Object.values(sel.proofs).reduce((n, p) => n + p.length, 0)} sibling hashes</dd>
                </dl>
                <VerifyPanel target={sel.id} autoRun />
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Brain, FileCheck2, GitBranch, LayoutDashboard, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BeliefSheet } from "@/components/engram/belief-sheet";
import { ErrorNote } from "@/components/engram/bits";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { HistoryView } from "@/views/history";
import { MindView } from "@/views/mind";
import { OverviewView } from "@/views/overview";
import { ReceiptsView } from "@/views/receipts";

const NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "mind", label: "Mind", icon: Brain },
  { id: "history", label: "History", icon: GitBranch },
  { id: "receipts", label: "Receipts", icon: FileCheck2 },
] as const;
type ViewId = (typeof NAV)[number]["id"];

const readHash = (): ViewId => {
  const h = location.hash.replace(/^#\/?/, "");
  return (NAV.find((n) => n.id === h)?.id ?? "overview") as ViewId;
};

export default function App() {
  const [view, setView] = useState<ViewId>(readHash);
  const [belief, setBelief] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const summary = useApi(() => api.summary(), [nonce]);

  useEffect(() => {
    const on = () => setView(readHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  return (
    <TooltipProvider>
      <div className="flex min-h-screen bg-background">
        <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r bg-card/40 px-3 py-5 backdrop-blur">
          <div className="flex items-center gap-2 px-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-brand-2 text-primary-foreground shadow-lg shadow-primary/30">
              <Brain className="size-4.5" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">engram</div>
              <div className="text-[10px] text-muted-foreground">git for agent memory</div>
            </div>
          </div>
          <nav className="mt-8 space-y-1">
            {NAV.map((n) => (
              <a
                key={n.id}
                href={`#/${n.id}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition hover:bg-accent/60 hover:text-foreground",
                  view === n.id && "bg-accent text-foreground",
                )}
              >
                <n.icon className="size-4" />
                {n.label}
              </a>
            ))}
          </nav>
          <div className="mt-auto space-y-2 px-2 text-[11px] text-muted-foreground">
            {summary.data && (
              <div className="rounded-lg border bg-background/50 p-2.5">
                <div className="font-medium text-foreground">{summary.data.agent}</div>
                <div className="mt-0.5">{summary.data.counts.beliefs} beliefs · {summary.data.counts.commits} commits</div>
              </div>
            )}
            <div>Memory on <span className="text-foreground">Walrus</span> · proofs on <span className="text-foreground">Sui</span> via <span className="text-foreground">Tatum</span></div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/70 px-8 backdrop-blur">
            <h1 className="text-sm font-medium">{NAV.find((n) => n.id === view)?.label}</h1>
            <Button variant="ghost" size="sm" onClick={() => setNonce((n) => n + 1)}>
              <RefreshCw className="size-3.5" /> Refresh
            </Button>
          </header>
          <div key={nonce} className={cn("mx-auto max-w-7xl px-8 py-8", view === "mind" && "h-[calc(100vh-3.5rem)] max-w-none")}>
            {summary.error && <ErrorNote message={`Can't reach the Engram API (${summary.error}). Start it with \`engram ui\`.`} />}
            {summary.data && view === "overview" && <OverviewView summary={summary.data} onOpenBelief={setBelief} />}
            {summary.data && view === "mind" && <MindView agent={summary.data.agent} />}
            {summary.data && view === "history" && <HistoryView onOpenBelief={setBelief} />}
            {summary.data && view === "receipts" && <ReceiptsView onOpenBelief={setBelief} />}
          </div>
        </main>
      </div>
      <BeliefSheet beliefRef={belief} onClose={() => setBelief(null)} />
    </TooltipProvider>
  );
}

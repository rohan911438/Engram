import { useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useParams } from "react-router";
import { Brain, Database, FileCheck2, GitBranch, Laptop, LayoutDashboard, Lock, Sparkles } from "lucide-react";
import { AgentSwitcher } from "@/components/engram/agent-switcher";
import { BeliefSheet } from "@/components/engram/belief-sheet";
import { Brand } from "@/components/engram/brand";
import { AddressAvatar, WalletButton } from "@/components/engram/wallet-button";
import { setSource, middle, type Source } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { StatusBanner } from "@/components/engram/status-banner";

export interface AppContext {
  source: Source;
  readOnly: boolean;
  openBelief: (ref: string) => void;
}

const NAV = [
  { to: "", label: "Agent", icon: LayoutDashboard, end: true },
  { to: "mind", label: "Mind", icon: Brain },
  { to: "memory", label: "Memory", icon: Database },
  { to: "history", label: "History", icon: GitBranch },
  { to: "receipts", label: "Receipts", icon: FileCheck2 },
];

/**
 * Shell for /app (your wallet's agent, or `engram ui` locally) and /demo
 * (the read-only demo agent). Sets where API calls go before children render.
 */
export function AppLayout({ kind }: { kind: "app" | "demo" | "linked" }) {
  const { mode, address } = useSession();
  const [belief, setBelief] = useState<string | null>(null);
  const loc = useLocation();
  const { id } = useParams();
  const source: Source | null =
    kind === "demo" ? "demo" : kind === "linked" ? (mode === "hosted" ? `linked/${id}` : null) : mode === "local" ? "local" : mode === "hosted" ? "me" : null;
  // Set synchronously so child data hooks hit the right agent on first render.
  if (source) setSource(source);
  const ctx = useMemo<AppContext>(() => ({ source: source ?? "local", readOnly: source !== "me", openBelief: setBelief }), [source]);
  const base = kind === "demo" ? "/demo" : kind === "linked" ? `/app/linked/${id}` : "/app";
  const linked = kind === "linked";
  const needsSignIn = (source === "me" || linked) && !address;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface-1 px-3 py-5 lg:flex">
        <Brand className="px-2" />
        <div className="mt-6 rounded-xl border border-border bg-white/[0.02] p-3">
          {source === "demo" ? (
            <div className="flex items-center gap-2 text-sm"><Sparkles className="size-4 text-brand" /> Demo agent <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">read-only</span></div>
          ) : source === "local" ? (
            <div className="text-sm">Local repo <span className="block text-xs text-muted-foreground">served by <code className="font-mono">engram ui</code></span></div>
          ) : linked ? (
            <div className="flex items-center gap-2 text-sm"><Laptop className="size-4 text-brand-2" /> Linked agent <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">CLI / SDK</span></div>
          ) : address ? (
            <div className="flex items-center gap-2.5">
              <AddressAvatar address={address} className="size-7" />
              <div className="min-w-0">
                <div className="text-sm font-medium">Your agent</div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">{middle(address, 8, 6)}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="size-4" /> Not signed in</div>
          )}
        </div>
        {address && mode === "hosted" && kind !== "demo" && <AgentSwitcher />}
        <div className="label mt-7 mb-2 px-3">Navigate</div>
        <nav className="space-y-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.label}
              to={n.to ? `${base}/${n.to}` : base}
              end={n.end}
              className={({ isActive }) =>
                cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-white/[0.04] hover:text-foreground", isActive && "bg-brand font-medium text-ink hover:bg-brand hover:text-ink")
              }
            >
              <n.icon className="size-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3 px-2 text-[11px] leading-relaxed text-muted-foreground">
          {source === "demo" && (
            <div className="rounded-xl border border-brand/20 bg-brand/[0.06] p-3 text-xs text-foreground/90">
              This is a demo memory. Connect your wallet to run an agent on your own transactions.
              <div className="mt-3"><WalletButton /></div>
            </div>
          )}
          <div>Memory on <span className="text-foreground">Walrus</span> · proofs on <span className="text-foreground">Sui</span> · read via <span className="text-foreground">Tatum</span></div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/75 px-6 backdrop-blur-xl lg:px-8">
          <div className="flex items-center gap-3 lg:hidden"><Brand /></div>
          <nav className="hidden items-center gap-1 text-sm text-muted-foreground lg:flex">
            <Link to="/" className="hover:text-foreground">Home</Link>
            <span className="opacity-40">/</span>
            <span className="text-foreground">{source === "demo" ? "Demo agent" : source === "local" ? "Local agent" : linked ? "Linked agent" : "Your agent"}</span>
            <span className="opacity-40">/</span>
            <span className="capitalize">{loc.pathname.split("/")[linked ? 4 : 2] || "overview"}</span>
          </nav>
          <WalletButton goToApp={kind === "demo"} />
        </header>
        <div className="lg:hidden">
          <div className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2">
            {NAV.map((n) => (
              <NavLink key={n.label} to={n.to ? `${base}/${n.to}` : base} end={n.end} className={({ isActive }) => cn("rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground", isActive && "bg-brand font-medium text-ink")}>
                {n.label}
              </NavLink>
            ))}
          </div>
        </div>
        <div className={cn("mx-auto max-w-7xl px-6 py-8 lg:px-8", loc.pathname.endsWith("/mind") && "h-[calc(100vh-3.5rem)] max-w-none")}>
          {source !== null && <StatusBanner />}
          {source === null ? null : needsSignIn ? <SignInGate /> : <Outlet context={ctx} key={source} />}
        </div>
      </main>
      <BeliefSheet beliefRef={belief} onClose={() => setBelief(null)} />
    </div>
  );
}

function SignInGate() {
  const { hasDemo } = useSession();
  return (
    <div className="relative mx-auto mt-10 max-w-xl overflow-hidden rounded-3xl border border-border bg-surface-1 p-10 text-center">
      <div className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(closest-side,rgba(212,255,58,0.35),transparent)]" />
      <div className="relative">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-foreground/12 bg-background"><Lock className="size-6 text-brand" /></div>
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-[-0.04em]">Sign in with your Sui wallet</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Your agent reads your wallet&apos;s transactions and takes your word as the owner&apos;s, so it needs to know the wallet is yours. Signing is free — no transaction, no gas.
        </p>
        <div className="mt-7 flex flex-col items-center gap-3">
          <WalletButton size="lg" goToApp={false} />
          {hasDemo && <Link to="/demo" className="text-sm text-muted-foreground hover:text-foreground">or explore the demo agent →</Link>}
        </div>
      </div>
    </div>
  );
}

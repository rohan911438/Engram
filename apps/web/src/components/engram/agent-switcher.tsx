import { useEffect, useState } from "react";
import { NavLink } from "react-router";
import { Bot, Copy, Laptop, Plus } from "lucide-react";
import { ago, server, type LinkedAgent } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * The signed-in wallet's agents: the hosted one (runs on this server) and any
 * CLI/SDK agents linked with `engram link`.
 */
export function AgentSwitcher() {
  const [agents, setAgents] = useState<Awaited<ReturnType<typeof server.agents>> | null>(null);
  const [showHow, setShowHow] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    server.agents().then(setAgents).catch(() => {});
  }, []);
  const cmd = `npx @rohankumar4179/engram link --server ${location.origin}`;
  const item = (active: boolean) => cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition hover:bg-white/[0.04] hover:text-foreground", active && "bg-white/[0.06] text-foreground");

  return (
    <div className="mt-6">
      <div className="mb-1.5 flex items-center justify-between px-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        Your agents
        <button type="button" onClick={() => setShowHow((v) => !v)} className="rounded p-0.5 hover:bg-white/[0.06] hover:text-foreground" aria-label="link a CLI or SDK agent" title="Link a CLI or SDK agent">
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="space-y-0.5">
        <NavLink to="/app" end={false} className={({ isActive }) => item(isActive && !location.pathname.startsWith("/app/linked"))}>
          <Bot className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{agents?.hosted.agent ?? "Wallet agent"}</span>
          <span className="text-[10px] opacity-60">hosted</span>
        </NavLink>
        {agents?.linked.map((a: LinkedAgent) => (
          <NavLink key={a.id} to={`/app/linked/${a.id}`} className={({ isActive }) => item(isActive)} title={a.syncedAt ? `synced ${ago(a.syncedAt)}` : "linked — waiting for the first sync"}>
            <Laptop className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{a.label}</span>
            <span className="text-[10px] opacity-60">{a.syncedAt ? `${a.commits} commits` : "not synced"}</span>
          </NavLink>
        ))}
      </div>
      {(showHow || agents?.linked.length === 0) && (
        <div className="mt-2 rounded-xl border border-border bg-white/[0.02] p-3 text-[11px] leading-relaxed text-muted-foreground">
          Link an agent you run with the CLI or SDK — run this in its folder:
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(cmd).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
            className="mt-2 flex w-full items-start gap-2 rounded-md bg-background/60 p-2 text-left font-mono text-[10.5px] break-all text-foreground/90 hover:bg-background"
          >
            <span className="flex-1">{cmd}</span>
            <Copy className="mt-0.5 size-3 shrink-0 opacity-60" />
          </button>
          {copied && <div className="mt-1 text-ok">copied</div>}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { middle } from "@/lib/api";

/** Monospace hash with copy button and optional explorer link. */
export function Hash({ value, href, a = 6, b = 4, className }: { value: string; href?: string; a?: number; b?: number; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-xs text-muted-foreground", className)}>
      <span title={value}>{middle(value, a, b)}</span>
      <button
        type="button"
        className="rounded p-0.5 opacity-60 transition hover:bg-accent hover:opacity-100"
        onClick={() => {
          void navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        aria-label="copy"
      >
        {copied ? <Check className="size-3 text-ok" /> : <Copy className="size-3" />}
      </button>
      {href && (
        <a href={href} target="_blank" rel="noreferrer" className="rounded p-0.5 opacity-60 transition hover:bg-accent hover:opacity-100" aria-label="open in explorer">
          <ExternalLink className="size-3" />
        </a>
      )}
    </span>
  );
}

/** Thin confidence meter. */
export function Confidence({ value, className }: { value: number; className?: string }) {
  const color = value >= 0.8 ? "bg-ok" : value >= 0.5 ? "bg-warn" : "bg-destructive";
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", color)} style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{value.toFixed(2)}</span>
    </span>
  );
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{children}</h2>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{children}</div>;
}

export function ErrorNote({ message }: { message: string }) {
  return <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{message}</div>;
}

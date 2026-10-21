import { useEffect, useState } from "react";
import { CircleCheck, CircleDashed, CircleX, Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type VerifyReport } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Runs `engram verify` through the local API and reveals the checks one by
 * one, so the chain of proof (signature → Merkle → Walrus → Sui) is visible.
 */
export function VerifyPanel({ target, autoRun = false }: { target: string; autoRun?: boolean }) {
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [shown, setShown] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setRunning(true);
    setReport(null);
    setShown(0);
    setError(null);
    api
      .verify(target)
      .then(setReport)
      .catch((e: Error) => setError(e.message))
      .finally(() => setRunning(false));
  };

  useEffect(() => {
    if (autoRun) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  useEffect(() => {
    if (!report || shown >= report.checks.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), 220);
    return () => clearTimeout(t);
  }, [report, shown]);

  const done = report && shown >= report.checks.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Signature, Merkle proofs, hash chain, manifest on <span className="text-foreground">Walrus Memory</span>, anchor on <span className="text-foreground">Sui</span> via Tatum.
        </div>
        <Button size="sm" onClick={run} disabled={running}>
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
          {running ? "Verifying…" : report ? "Verify again" : "Verify"}
        </Button>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {(running || report) && (
        <ul className="divide-y rounded-xl border bg-background/40">
          {running && !report && (
            <li className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Reading Walrus Memory and Sui…
            </li>
          )}
          {report?.checks.slice(0, shown).map((c) => (
            <li key={c.name} className="flex items-start gap-3 px-4 py-2.5 text-sm animate-in fade-in slide-in-from-left-1">
              {c.skipped ? <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : c.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" />}
              <span className="w-40 shrink-0 font-medium">{c.name}</span>
              <span className={cn("min-w-0 break-words text-muted-foreground", !c.ok && !c.skipped && "text-destructive")}>{c.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {done && (
        <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-3 animate-in fade-in zoom-in-95", report.ok ? "border-ok/30 bg-ok/10" : "border-destructive/30 bg-destructive/10")}>
          {report.ok ? <ShieldCheck className="size-5 text-ok" /> : <ShieldX className="size-5 text-destructive" />}
          <div className="text-sm">
            <div className="font-medium">{report.ok ? "Valid" : "Invalid"}</div>
            <div className="text-muted-foreground">
              {report.ok
                ? report.checks.some((c) => c.skipped)
                  ? "Every check that ran passed (some were skipped)."
                  : "This memory is exactly what was committed, signed and anchored on-chain."
                : "Something was changed after it was committed."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

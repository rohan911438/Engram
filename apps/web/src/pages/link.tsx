import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CircleCheck, CircleX, KeyRound, Laptop, Loader2, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/engram/brand";
import { WalletButton } from "@/components/engram/wallet-button";
import { middle, server } from "@/lib/api";
import { useSession } from "@/lib/session";

type Info = Awaited<ReturnType<typeof server.linkInfo>>;

/**
 * /link?code=XXXX-XXXX — the owner approves linking a CLI/SDK agent to the
 * signed-in wallet. The agent's terminal is waiting on the other side.
 */
export function LinkPage() {
  const [params] = useSearchParams();
  const code = (params.get("code") ?? "").toUpperCase();
  const { address } = useSession();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"approved" | "denied" | null>(null);

  useEffect(() => {
    if (!address || !code) return;
    setError(null);
    server.linkInfo(code).then(setInfo, (e: Error) => setError(e.message));
  }, [address, code]);

  const decide = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await server.linkDecide(code, approve);
      setDone(r.status === "approved" ? "approved" : "denied");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-svh bg-background px-4 py-6">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <Brand />
        <WalletButton goToApp={false} />
      </div>
      <div className="relative mx-auto mt-16 max-w-lg overflow-hidden rounded-3xl border border-border bg-surface-1 p-8 sm:p-10">
        <div className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(closest-side,rgba(255,122,69,0.25),transparent)]" />
        <div className="relative">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-foreground/12 bg-background"><Laptop className="size-5 text-brand-2" /></div>
          <h1 className="mt-5 font-display text-3xl font-semibold tracking-[-0.04em]">Link an agent to your dashboard</h1>
          {!code && <p className="mt-3 text-sm text-destructive">This page needs a code. Run <code className="font-mono">engram link</code> to get one.</p>}

          {code && !address && (
            <>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                An agent asked to link with code <span className="font-mono text-foreground">{code}</span>. Sign in with the Sui wallet whose dashboard it should appear on.
              </p>
              <div className="mt-6"><WalletButton size="lg" goToApp={false} /></div>
            </>
          )}

          {code && address && !done && (
            <>
              {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
              {!info && !error && <div className="mt-6 h-28 animate-pulse rounded-xl bg-white/[0.03]" />}
              {info && (
                <>
                  <p className="mt-3 text-sm text-muted-foreground">Check that this code matches the one in your terminal:</p>
                  <div className="mt-3 rounded-xl border border-foreground/12 bg-background/60 py-3 text-center font-mono text-2xl tracking-[0.3em]">{code}</div>
                  <dl className="mt-5 space-y-2 text-sm">
                    <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Agent</dt><dd className="font-medium">{info.label}{info.label !== info.agent && <span className="ml-2 font-mono text-xs text-muted-foreground">{info.agent}</span>}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Signing key</dt><dd className="font-mono text-xs">{middle(info.agentPubKey, 10, 6)}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Wallet</dt><dd className="font-mono text-xs">{middle(address, 10, 6)}</dd></div>
                  </dl>
                  <ul className="mt-5 space-y-1.5 text-xs text-muted-foreground">
                    <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ok" /> Only its commits, beliefs and signed receipts are shared — never raw memories or keys.</li>
                    <li className="flex gap-2"><KeyRound className="mt-0.5 size-3.5 shrink-0 text-ok" /> Every sync is verified (signatures, Merkle roots, Sui anchors) before it's shown.</li>
                  </ul>
                  <div className="mt-7 flex gap-3">
                    <button type="button" disabled={busy} onClick={() => decide(true)} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-white text-sm font-medium text-black transition hover:bg-brand/85 disabled:opacity-60">
                      {busy && <Loader2 className="size-4 animate-spin" />} Approve
                    </button>
                    <button type="button" disabled={busy} onClick={() => decide(false)} className="h-11 rounded-full border border-foreground/12 px-5 text-sm text-muted-foreground transition hover:bg-white/[0.05] hover:text-foreground disabled:opacity-60">
                      Decline
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {done === "approved" && (
            <div className="mt-5 space-y-4">
              <p className="flex items-center gap-2 text-sm text-ok"><CircleCheck className="size-4" /> Linked. Your terminal will finish on its own.</p>
              <Link to="/app" className="inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-medium text-black hover:bg-brand/85">Go to your agents</Link>
            </div>
          )}
          {done === "denied" && <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><CircleX className="size-4" /> Declined. Nothing was linked.</p>}
        </div>
      </div>
    </div>
  );
}

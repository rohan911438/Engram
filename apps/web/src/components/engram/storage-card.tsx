import { useState } from "react";
import { useSignTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { CircleCheck, Database, KeyRound, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { Hash } from "@/components/engram/bits";
import { api, links, type StorageStatus } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "create-account", icon: UserPlus, title: "Create your Walrus Memory account", hint: "One Sui transaction from your wallet. Each wallet can own one account." },
  { key: "authorize-key", icon: KeyRound, title: "Authorize this agent's key", hint: "Lets the agent write to your account. You can remove it any time." },
  { key: "switch", icon: Database, title: "Store new memories in your account", hint: "Older memories stay readable where they were written." },
] as const;

/**
 * Where the agent's memory lives. By default it uses Engram's shared Walrus
 * Memory account; the owner can move it to their own account in two wallet
 * transactions (the server builds them, the wallet signs, the server submits).
 */
export function StorageCard() {
  const [nonce, setNonce] = useState(0);
  const status = useApi(() => api.storage(), [nonce]);
  const { mutateAsync: signTransaction } = useSignTransaction();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const s = status.data;
  const doStep = async (step: StorageStatus["next"]) => {
    setBusy(step);
    setError(null);
    try {
      if (step === "create-account" || step === "authorize-key") {
        const { bytes } = await api.storageTx(step);
        // The server built the transaction over gRPC; the wallet gets it as serialized JSON.
        const json = await Transaction.from(bytes).toJSON();
        const signed = await signTransaction({ transaction: json });
        await api.storageExecute(signed.bytes, signed.signature);
      } else if (step === "switch") {
        await api.storageUse("own");
      }
      setNonce((n) => n + 1);
    } catch (e) {
      const msg = (e as Error).message;
      setError(/reject|denied|cancel/i.test(msg) ? "The wallet request was cancelled." : /insufficient|gas|balance/i.test(msg) ? "Your wallet needs a little SUI on Mainnet for gas (about 0.01 SUI)." : msg);
    } finally {
      setBusy(null);
    }
  };

  const order = STEPS.map((x) => x.key);
  const currentIndex = s ? (s.next === "done" ? STEPS.length : order.indexOf(s.next as (typeof order)[number])) : -1;

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#08080b] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-4 text-[#67e8f9]" /> Where your memory lives
        </div>
        {s && (
          <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px]", s.next === "done" ? "border-emerald-400/30 text-emerald-300" : "border-white/10 text-muted-foreground")}>
            {s.next === "done" ? "your own Walrus Memory account" : "Engram's shared account"}
          </span>
        )}
      </div>
      {status.error && <div className="mt-3 text-sm text-destructive">{status.error}</div>}
      {!s && !status.error && <div className="mt-4 h-24 animate-pulse rounded-xl bg-white/[0.03]" />}
      {s && s.next === "done" && (
        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
          <p>New memories are encrypted and stored in your own account. Only you and the keys you authorize can read them.</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span>account <Hash value={s.accountId!} href={links.suiObject(s.accountId!)} /></span>
            <span>agent key <Hash value={s.delegate.suiAddress} href={links.suiAccount(s.delegate.suiAddress)} /></span>
          </div>
        </div>
      )}
      {s && s.next !== "done" && (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            Your agent currently writes to Engram's shared Walrus Memory account. Move it to an account <span className="text-foreground">you own</span>, so the memory is yours.
          </p>
          <ol className="mt-4 space-y-2">
            {STEPS.map((step, i) => {
              const done = i < currentIndex;
              const active = i === currentIndex;
              return (
                <li key={step.key} className={cn("flex items-center gap-3 rounded-xl border p-3", active ? "border-white/15 bg-white/[0.03]" : "border-white/[0.05]", !active && !done && "opacity-50")}>
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", done ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.05] text-muted-foreground")}>
                    {done ? <CircleCheck className="size-4" /> : <step.icon className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{step.title}</div>
                    <div className="text-xs text-muted-foreground">{step.hint}</div>
                  </div>
                  {active && (
                    <button type="button" disabled={!!busy} onClick={() => doStep(step.key)} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-white px-4 text-xs font-medium text-black transition hover:bg-white/90 disabled:opacity-60">
                      {busy === step.key && <Loader2 className="size-3.5 animate-spin" />}
                      {step.key === "switch" ? "Switch" : "Sign"}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {error && <div className="mt-3 text-sm text-destructive">{error}</div>}
        </>
      )}
    </section>
  );
}

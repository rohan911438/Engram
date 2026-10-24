import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ConnectModal } from "@mysten/dapp-kit";
import { ArrowRight, ChevronDown, Loader2, LogOut, PenLine, Wallet } from "lucide-react";
import { middle } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

/** Deterministic gradient avatar for an address. */
export function AddressAvatar({ address, className }: { address: string; className?: string }) {
  const h1 = parseInt(address.slice(2, 6), 16) % 360;
  const h2 = (h1 + 80 + (parseInt(address.slice(6, 8), 16) % 120)) % 360;
  return <span className={cn("inline-block size-5 rounded-full ring-1 ring-white/15", className)} style={{ background: `conic-gradient(from 140deg, hsl(${h1} 85% 62%), hsl(${h2} 85% 58%), hsl(${h1} 85% 62%))` }} />;
}

/**
 * Not connected → "Connect wallet" (opens the wallet picker, then asks to sign).
 * Connected, not signed in → "Sign in" (one free signature).
 * Signed in → address pill with "My agent" and "Sign out".
 */
export function WalletButton({ size = "md", goToApp = true }: { size?: "md" | "lg"; goToApp?: boolean }) {
  const { mode, address, connected, signingIn, error, signIn, signOut } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const wantSignIn = useRef(false);
  const big = size === "lg";
  const base = cn(
    "inline-flex items-center gap-2 rounded-full font-medium transition-all",
    big ? "h-12 px-6 text-[15px]" : "h-9 px-4 text-sm",
  );

  // After the wallet connects from our button, go straight to the signature.
  useEffect(() => {
    if (connected && !address && wantSignIn.current) {
      wantSignIn.current = false;
      void signIn().then((ok) => ok && goToApp && navigate("/app"));
    }
  }, [connected, address, signIn, navigate, goToApp]);

  if (mode === "local") {
    return (
      <button type="button" onClick={() => navigate("/app")} className={cn(base, "bg-brand text-ink hover:bg-brand/85")}>
        Open inspector <ArrowRight className="size-4" />
      </button>
    );
  }

  if (address) {
    return (
      <div className="relative">
        <button type="button" onClick={() => setMenu((m) => !m)} className={cn(base, "border border-foreground/12 bg-white/[0.04] pr-3 pl-2 hover:bg-white/[0.08]")}>
          <AddressAvatar address={address} />
          <span className="font-mono text-[13px]">{middle(address, 6, 4)}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-foreground/12 bg-popover p-1 shadow-2xl shadow-black">
              <button type="button" onClick={() => { setMenu(false); navigate("/app"); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5">
                <ArrowRight className="size-4 text-muted-foreground" /> My agent
              </button>
              <button type="button" onClick={() => { setMenu(false); void signOut(); navigate("/"); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground">
                <LogOut className="size-4" /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (connected) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button type="button" disabled={signingIn} onClick={() => void signIn().then((ok) => ok && goToApp && navigate("/app"))} className={cn(base, "bg-brand text-ink shadow-[0_0_40px_-10px_rgba(212,255,58,0.7)] hover:bg-brand/85 disabled:opacity-70")}>
          {signingIn ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />}
          {signingIn ? "Check your wallet…" : "Sign in to your agent"}
        </button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    );
  }

  return (
    <ConnectModal
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) wantSignIn.current = true;
      }}
      trigger={
        <button type="button" className={cn(base, "bg-brand text-ink shadow-[0_0_40px_-10px_rgba(212,255,58,0.7)] hover:bg-brand/85")}>
          <Wallet className="size-4" /> Connect wallet
        </button>
      }
    />
  );
}

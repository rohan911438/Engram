import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useCurrentAccount, useDisconnectWallet, useSignPersonalMessage } from "@mysten/dapp-kit";
import { server } from "./api";

interface SessionValue {
  /** "hosted" = Engram server with wallets; "local" = `engram ui` for one repo. */
  mode: "local" | "hosted" | null;
  hasDemo: boolean;
  /** Address of the signed-in wallet (server session), if any. */
  address: string | null;
  /** Address of the connected wallet extension, signed in or not. */
  connected: string | null;
  signingIn: boolean;
  error: string | null;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const account = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { mutate: disconnect } = useDisconnectWallet();
  const [mode, setMode] = useState<SessionValue["mode"]>(null);
  const [hasDemo, setHasDemo] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    server.mode().then((m) => {
      setMode(m.mode);
      setHasDemo(!!m.demo);
      if (m.mode === "hosted") server.me().then((r) => setAddress(r.address)).catch(() => {});
    });
  }, []);

  // Switching wallets in the extension ends the old session.
  useEffect(() => {
    if (address && account && account.address !== address) {
      setAddress(null);
      void server.logout();
    }
  }, [account, address]);

  const signIn = useCallback(async () => {
    if (!account) return false;
    setSigningIn(true);
    setError(null);
    try {
      const { nonce, message } = await server.challenge(account.address);
      const { signature } = await signPersonalMessage({ message: new TextEncoder().encode(message) });
      const r = await server.verify(nonce, signature);
      setAddress(r.address);
      return true;
    } catch (e) {
      const msg = (e as Error).message;
      setError(/reject|denied|cancel/i.test(msg) ? "Signature request was cancelled." : msg);
      return false;
    } finally {
      setSigningIn(false);
    }
  }, [account, signPersonalMessage]);

  const signOut = useCallback(async () => {
    await server.logout().catch(() => {});
    setAddress(null);
    disconnect();
  }, [disconnect]);

  return (
    <Ctx.Provider value={{ mode, hasDemo, address, connected: account?.address ?? null, signingIn, error, signIn, signOut }}>{children}</Ctx.Provider>
  );
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}

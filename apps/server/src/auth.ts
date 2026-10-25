import { createHash, randomBytes } from "node:crypto";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import type { Signer } from "./secret.js";

const SESSION_PREFIX = "s1_";

/**
 * Wallet sign-in: the server hands out a one-time message, the wallet signs
 * it (free — no transaction, no gas), and the server checks the signature
 * belongs to the claimed address. That proves the visitor owns the wallet
 * the agent is about to read.
 */
export class WalletAuth {
  private challenges = new Map<string, { address: string; message: string; expires: number }>();
  private sessions = new Map<string, { address: string; expires: number }>();
  /** Signed-out session tokens (only until restart; tokens also expire on their own). */
  private loggedOut = new Set<string>();

  /** With a `signer`, session tokens are signed and survive a server restart. */
  constructor(private opts: { ttlMs?: number; sessionMs?: number; now?: () => number; signer?: Signer } = {}) {}

  private now() {
    return this.opts.now?.() ?? Date.now();
  }

  challenge(address: string): { nonce: string; message: string } {
    if (!isSuiAddress(address)) throw new Error("not a Sui address");
    const nonce = randomBytes(16).toString("hex");
    const message = [
      "Sign in to Engram",
      "",
      `Wallet: ${address}`,
      `Nonce: ${nonce}`,
      `Issued: ${new Date(this.now()).toISOString()}`,
      "",
      "This proves you own this wallet so your Engram agent can learn from it.",
      "It is free, sends no transaction and moves no funds.",
    ].join("\n");
    this.challenges.set(nonce, { address: normalize(address), message, expires: this.now() + (this.opts.ttlMs ?? 5 * 60_000) });
    return { nonce, message };
  }

  /** Returns a session token if the signature is valid for the challenge. */
  async verify(nonce: string, signature: string): Promise<{ token: string; address: string }> {
    const c = this.challenges.get(nonce);
    this.challenges.delete(nonce); // one use only
    if (!c || c.expires < this.now()) throw new Error("sign-in request expired — try again");
    await verifyPersonalMessageSignature(new TextEncoder().encode(c.message), signature, { address: c.address });
    const expires = this.now() + (this.opts.sessionMs ?? 7 * 24 * 3600_000);
    if (this.opts.signer) {
      const token = this.opts.signer.sign(SESSION_PREFIX, { a: c.address, e: expires, n: randomBytes(9).toString("base64url") });
      return { token, address: c.address };
    }
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(token, { address: c.address, expires });
    return { token, address: c.address };
  }

  session(token: string | undefined): string | null {
    if (!token) return null;
    const s = this.sessions.get(token);
    if (s) return s.expires < this.now() ? null : s.address;
    const signed = this.opts.signer?.open<{ a: string; e: number }>(SESSION_PREFIX, token);
    if (!signed || typeof signed.a !== "string" || !(signed.e > this.now()) || !isSuiAddress(signed.a)) return null;
    if (this.loggedOut.has(hash(token))) return null;
    return normalize(signed.a);
  }

  logout(token: string | undefined) {
    if (!token) return;
    this.sessions.delete(token);
    if (this.opts.signer?.open(SESSION_PREFIX, token)) this.loggedOut.add(hash(token));
  }
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export function isSuiAddress(a: string): boolean {
  return /^0x[0-9a-fA-F]{1,64}$/.test(a);
}

/** Full-length lowercase 0x + 64 hex. */
export function normalize(a: string): string {
  return `0x${a.slice(2).toLowerCase().padStart(64, "0")}`;
}

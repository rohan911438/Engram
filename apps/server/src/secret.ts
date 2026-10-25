import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Self-contained signed tokens (payload + HMAC). The server can check them
 * without having stored anything, so sign-ins and dashboard links survive a
 * restart, even on hosts whose disk is wiped (e.g. Render's free plan).
 */
export class Signer {
  constructor(private key: Buffer) {}

  sign(prefix: string, payload: object): string {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${prefix}${body}.${this.mac(prefix + body)}`;
  }

  /** The payload, or null if the token isn't ours or was tampered with. */
  open<T>(prefix: string, token: string): T | null {
    if (!token.startsWith(prefix)) return null;
    const dot = token.lastIndexOf(".");
    if (dot <= prefix.length) return null;
    const body = token.slice(prefix.length, dot);
    const want = Buffer.from(this.mac(prefix + body));
    const got = Buffer.from(token.slice(dot + 1));
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    try {
      return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    } catch {
      return null;
    }
  }

  private mac(s: string) {
    return createHmac("sha256", this.key).update(s).digest("base64url");
  }
}

/**
 * The server's signing key. Uses ENGRAM_SECRET; otherwise derives one from a
 * secret the server already has (so it stays the same across restarts with no
 * extra setup); otherwise a random key, which only lasts until the next restart.
 */
export function serverSigner(env: Record<string, string | undefined> = process.env): { signer: Signer; source: "ENGRAM_SECRET" | "derived" | "random" } {
  if (env.ENGRAM_SECRET) return { signer: new Signer(createHash("sha256").update(env.ENGRAM_SECRET).digest()), source: "ENGRAM_SECRET" };
  const base = env.MEMWAL_KEY || env.SUI_MNEMONIC;
  if (base) return { signer: new Signer(createHmac("sha256", "engram-server-token-key-v1").update(base.trim()).digest()), source: "derived" };
  return { signer: new Signer(randomBytes(32)), source: "random" };
}

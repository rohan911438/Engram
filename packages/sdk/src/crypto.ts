import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { ed25519 } from "@noble/curves/ed25519.js";

export { bytesToHex, hexToBytes };

/**
 * Deterministic JSON: object keys sorted, no whitespace, `undefined` fields dropped.
 * Everything Engram hashes or signs goes through this.
 */
export function canonical(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortValue(x);
    }
    return out;
  }
  return v;
}

export function sha256Hex(data: string | Uint8Array): string {
  return bytesToHex(sha256(typeof data === "string" ? utf8ToBytes(data) : data));
}

export function sha256Bytes(data: Uint8Array): Uint8Array {
  return sha256(data);
}

export function randomId(prefix: string, bytes = 6): string {
  return `${prefix}_${randomBytes(bytes).toString("hex")}`;
}

// ---- Ed25519 -------------------------------------------------------------

export interface KeyPair {
  secretKey: string; // hex
  publicKey: string; // hex
}

export function generateKeyPair(): KeyPair {
  const sk = ed25519.utils.randomSecretKey();
  return { secretKey: bytesToHex(sk), publicKey: bytesToHex(ed25519.getPublicKey(sk)) };
}

export function publicKeyOf(secretKeyHex: string): string {
  return bytesToHex(ed25519.getPublicKey(hexToBytes(secretKeyHex)));
}

export function sign(message: string, secretKeyHex: string): string {
  return bytesToHex(ed25519.sign(utf8ToBytes(message), hexToBytes(secretKeyHex)));
}

export function verifySignature(message: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    return ed25519.verify(hexToBytes(signatureHex), utf8ToBytes(message), hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}

// ---- AES-256-GCM -----------------------------------------------------------

export interface Sealed {
  iv: string; // base64
  ct: string; // base64
  tag: string; // base64
}

export function newDataKey(): Buffer {
  return randomBytes(32);
}

export function encrypt(plaintext: Uint8Array, key: Uint8Array, aad?: string): Sealed {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  if (aad) c.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return { iv: iv.toString("base64"), ct: ct.toString("base64"), tag: c.getAuthTag().toString("base64") };
}

export function decrypt(sealed: Sealed, key: Uint8Array, aad?: string): Buffer {
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
  if (aad) d.setAAD(Buffer.from(aad, "utf8"));
  d.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(sealed.ct, "base64")), d.final()]);
}

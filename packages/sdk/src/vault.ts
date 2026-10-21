import { decrypt, encrypt, newDataKey, randomId, type Sealed } from "./crypto.js";
import type { JsonFile } from "./store.js";

interface VaultFile {
  v: 1;
  /** keyId → data key wrapped (AES-GCM) with the master key */
  keys: Record<string, Sealed & { createdAt: number }>;
  /** keyId → time it was destroyed */
  destroyed: Record<string, number>;
}

/**
 * Holds one random data key per episode, each wrapped by a master key.
 * Destroying a data key makes that episode unreadable everywhere — the
 * ciphertext on Walrus stays, but can never be opened again.
 */
export class KeyVault {
  constructor(
    private file: JsonFile<VaultFile>,
    private masterKey: Uint8Array,
  ) {
    if (masterKey.length !== 32) throw new Error("master key must be 32 bytes");
  }

  private load(): VaultFile {
    return this.file.read() ?? { v: 1, keys: {}, destroyed: {} };
  }

  create(): { keyId: string; key: Buffer } {
    const vault = this.load();
    const keyId = randomId("k", 8);
    const key = newDataKey();
    vault.keys[keyId] = { ...encrypt(key, this.masterKey, keyId), createdAt: Date.now() };
    this.file.write(vault);
    return { keyId, key };
  }

  get(keyId: string): Buffer | null {
    const wrapped = this.load().keys[keyId];
    return wrapped ? decrypt(wrapped, this.masterKey, keyId) : null;
  }

  isDestroyed(keyId: string): boolean {
    return keyId in this.load().destroyed;
  }

  /** Removes the wrapped key from disk. Returns false if it was already gone. */
  destroy(keyId: string): boolean {
    const vault = this.load();
    if (!vault.keys[keyId]) return false;
    delete vault.keys[keyId];
    vault.destroyed[keyId] = Date.now();
    this.file.write(vault);
    return true;
  }
}

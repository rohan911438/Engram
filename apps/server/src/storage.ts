import {
  buildAddDelegateTx,
  buildCreateAccountTx,
  executeSigned,
  findMemwalAccount,
  readMemwalAccount,
  suiGrpc,
  type MemwalAccountInfo,
} from "@engram/sdk";
import type { Tenant } from "./tenants.js";

/** Chain access for storage setup (swapped for a fake in tests). */
export interface StorageChain {
  find(owner: string): Promise<string | null>;
  read(accountId: string): Promise<MemwalAccountInfo>;
  buildCreate(sender: string): Promise<string>;
  buildDelegate(sender: string, accountId: string, publicKeyHex: string): Promise<string>;
  execute(bytes: string, signature: string): Promise<string>;
}

export function mainnetStorageChain(): StorageChain {
  const c = () => suiGrpc("mainnet");
  return {
    find: (owner) => findMemwalAccount(c(), owner),
    read: (id) => readMemwalAccount(c(), id),
    buildCreate: (sender) => buildCreateAccountTx(c(), sender),
    buildDelegate: (sender, id, pk) => buildAddDelegateTx(c(), sender, id, pk, "Engram agent"),
    execute: (bytes, sig) => executeSigned(c(), bytes, sig),
  };
}

export interface StorageStatus {
  mode: "hosted" | "own";
  /** The owner's Walrus Memory account, if they have one. */
  accountId: string | null;
  /** This agent's delegate key — what the owner authorizes. */
  delegate: { publicKey: string; suiAddress: string };
  delegateAuthorized: boolean;
  /** What the owner should do next. */
  next: "create-account" | "authorize-key" | "switch" | "done";
}

export async function storageStatus(t: Tenant, chain: StorageChain): Promise<StorageStatus> {
  const s = t.storageState();
  const delegate = t.delegate();
  const accountId = await chain.find(t.address);
  let delegateAuthorized = false;
  if (accountId) {
    const info = await chain.read(accountId);
    delegateAuthorized = info.delegates.some((d) => d.publicKey === delegate.publicKey);
  }
  const ready = s.mode === "own" && s.accountId === accountId && delegateAuthorized;
  return {
    mode: s.mode,
    accountId,
    delegate,
    delegateAuthorized,
    next: !accountId ? "create-account" : !delegateAuthorized ? "authorize-key" : ready ? "done" : "switch",
  };
}

/** Unsigned transaction for the owner's wallet: create the account, or authorize the agent's key. */
export async function storageTx(t: Tenant, chain: StorageChain, step: string): Promise<{ bytes: string }> {
  if (step === "create-account") {
    if (await chain.find(t.address)) throw new Error("this wallet already has a Walrus Memory account");
    return { bytes: await chain.buildCreate(t.address) };
  }
  if (step === "authorize-key") {
    const accountId = await chain.find(t.address);
    if (!accountId) throw new Error("create your Walrus Memory account first");
    return { bytes: await chain.buildDelegate(t.address, accountId, t.delegate().publicKey) };
  }
  throw new Error("unknown step");
}

/**
 * Switches the agent to the owner's own account — only after the chain shows
 * the account belongs to this wallet and the agent's key is authorized on it.
 */
export async function useOwnStorage(t: Tenant, chain: StorageChain): Promise<StorageStatus> {
  const accountId = await chain.find(t.address);
  if (!accountId) throw new Error("no Walrus Memory account for this wallet yet");
  const info = await chain.read(accountId);
  if (info.owner !== normalize(t.address)) throw new Error("that account belongs to a different wallet");
  if (!info.delegates.some((d) => d.publicKey === t.delegate().publicKey)) throw new Error("authorize the agent's key on your account first");
  t.useStorage("own", accountId);
  return storageStatus(t, chain);
}

const normalize = (a: string) => `0x${a.replace(/^0x/, "").toLowerCase().padStart(64, "0")}`;

import { bcs } from "@mysten/sui/bcs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { MEMWAL_MAINNET } from "./remote.js";

/**
 * A user's own Walrus Memory account, set up from the browser: the user's
 * wallet creates the account and authorizes a delegate key that the Engram
 * server holds for their agent. These helpers read that state from chain and
 * build the two transactions; the wallet only signs.
 */

export interface MemwalIds {
  packageId: string;
  registryId: string;
}

export interface MemwalAccountInfo {
  accountId: string;
  owner: string;
  delegates: { publicKey: string; suiAddress: string; label: string }[];
}

/** A fresh Ed25519 delegate key; `secret` is the suiprivkey1… form. */
export function newDelegateKey(): { secret: string; publicKey: string; suiAddress: string } {
  const kp = new Ed25519Keypair();
  return { secret: kp.getSecretKey(), publicKey: Buffer.from(kp.getPublicKey().toRawBytes()).toString("hex"), suiAddress: kp.toSuiAddress() };
}

export function delegateFromSecret(secret: string): { publicKey: string; suiAddress: string } {
  const kp = Ed25519Keypair.fromSecretKey(secret);
  return { publicKey: Buffer.from(kp.getPublicKey().toRawBytes()).toString("hex"), suiAddress: kp.toSuiAddress() };
}

/** Finds the Walrus Memory account an address owns (each address can own one). */
export async function findMemwalAccount(client: SuiGrpcClient, owner: string, ids: MemwalIds = MEMWAL_MAINNET): Promise<string | null> {
  const { object } = await client.getObject({ objectId: ids.registryId, include: { json: true } });
  const tableId = (object.json as { accounts?: { id?: string } } | null)?.accounts?.id;
  if (!tableId) throw new Error("Walrus Memory registry has no accounts table");
  try {
    const f = await client.getDynamicField({ parentId: tableId, name: { type: "address", bcs: bcs.Address.serialize(normalizeSuiAddress(owner)).toBytes() } });
    const value = f.dynamicField?.value;
    if (!value) return null;
    // Table<address, ID>: the value is the 32-byte account ID.
    return normalizeSuiAddress(Buffer.from(value.bcs).toString("hex"));
  } catch (err) {
    if (/not ?found|does not exist/i.test(String((err as Error).message))) return null;
    throw err;
  }
}

export async function readMemwalAccount(client: SuiGrpcClient, accountId: string): Promise<MemwalAccountInfo> {
  const { object } = await client.getObject({ objectId: accountId, include: { json: true } });
  const j = object.json as { owner?: string; delegate_keys?: { public_key: string; sui_address: string; label?: string }[] } | null;
  if (!j?.owner) throw new Error(`${accountId} is not a Walrus Memory account`);
  return {
    accountId,
    owner: normalizeSuiAddress(j.owner),
    delegates: (j.delegate_keys ?? []).map((d) => ({
      publicKey: /^[0-9a-f]+$/i.test(d.public_key) ? d.public_key.toLowerCase() : Buffer.from(d.public_key, "base64").toString("hex"),
      suiAddress: normalizeSuiAddress(d.sui_address),
      label: d.label ?? "",
    })),
  };
}

/** Unsigned `create_account` transaction for `sender`, as base64 bytes ready for a wallet. */
export async function buildCreateAccountTx(client: SuiGrpcClient, sender: string, ids: MemwalIds = MEMWAL_MAINNET): Promise<string> {
  const tx = new Transaction();
  tx.setSender(sender);
  tx.moveCall({ target: `${ids.packageId}::account::create_account`, arguments: [tx.object(ids.registryId), tx.object.clock()] });
  return Buffer.from(await tx.build({ client })).toString("base64");
}

/** Unsigned `add_delegate_key` transaction (owner adds the server's key). */
export async function buildAddDelegateTx(client: SuiGrpcClient, sender: string, accountId: string, publicKeyHex: string, label: string, ids: MemwalIds = MEMWAL_MAINNET): Promise<string> {
  const tx = new Transaction();
  tx.setSender(sender);
  tx.moveCall({
    target: `${ids.packageId}::account::add_delegate_key`,
    arguments: [tx.object(accountId), tx.object(ids.registryId), tx.pure.vector("u8", Buffer.from(publicKeyHex, "hex")), tx.pure.string(label), tx.object.clock()],
  });
  return Buffer.from(await tx.build({ client })).toString("base64");
}

/** Submits wallet-signed bytes and waits for them to land. Returns the digest. */
export async function executeSigned(client: SuiGrpcClient, bytesBase64: string, signature: string): Promise<string> {
  const res = await client.executeTransaction({ transaction: Buffer.from(bytesBase64, "base64"), signatures: [signature] });
  if (res.$kind !== "Transaction") throw new Error(`transaction failed: ${JSON.stringify(res.FailedTransaction?.status)}`);
  await client.waitForTransaction({ digest: res.Transaction.digest });
  return res.Transaction.digest;
}

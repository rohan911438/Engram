# Spike findings (21 Oct 2026)

Live tests against Walrus Memory (Mainnet relayer) and Tatum Sui Mainnet RPC.

| Question | Answer |
|---|---|
| Does `rememberAndWait` return a blob ID? | **Yes.** `{ id, blob_id, owner, namespace }`. Takes ~25–30 s per write. |
| Is text returned exactly as stored? | **Yes**, byte-for-byte, by `recall`. |
| Can we list namespaces? | **Yes**, `listNamespaces()` returns name, memory count, storage used. |
| Is there "get by blob ID"? | **No.** Only semantic `recall`. Engram keeps its own index (`.engram/`) and treats Walrus as the durable remote. |
| What lands on Walrus? | Seal-encrypted bytes (398 B for our test). The public aggregator serves them, but they can't be read without Seal keys. |
| What lands on Sui? | One `walrus::blob::Blob` object per memory, **owned by the account owner address**, with `blob_id` (u256), `registered_epoch`, `certified_epoch`, `size`. |
| Can Tatum read it? | **Yes.** `suix_getOwnedObjects` + `sui_getObject` via `sui-mainnet.gateway.tatum.io`. The u256 `blob_id` decodes (little-endian, base64url) to exactly the ID the SDK returned. |
| Tatum Sui Testnet? | **Not available** (404). Use Tatum for Mainnet verification. |
| Who pays storage? | The public relayer — no SUI/WAL needed from us for memories. |

## Decisions

- **Anchoring, option A works:** commit manifest → stored via Walrus Memory → `blob_id` →
  matching Sui `Blob` object found through Tatum → creating transaction + checkpoint time.
  Option B (own Move module, root in plaintext event) stays a later upgrade.
- **Episodes** are encrypted client-side (AES-256-GCM, one key each) before going to Walrus
  Memory, so `forget` can crypto-shred them.
- **Beliefs** are stored as readable text so Walrus Memory's semantic `recall` can find the
  beliefs relevant to a task. On `forget`, dependent beliefs are retracted (limit: their old
  text is still in Walrus history — documented).
- **Bulk writes** (`rememberBulk`) for many episodes, since each write takes ~27 s.

# 05 — Cryptography

Plain-language first, details second.

## 1. Commits (snapshots of the mind)

**Plain:** All of the agent's current beliefs are combined into one fingerprint. If any belief
changes later, the fingerprint no longer matches.

**Detail:**
- Leaf for each active belief: `sha256(beliefId ‖ version ‖ sha256(statement) ‖ confidence ‖ evidenceRoot)`
- Tombstones (forgotten episodes) are also leaves, so forgetting is itself recorded.
- Leaves sorted by ID → binary **Merkle tree** → `merkleRoot`.
- Manifest `{ parent, ts, merkleRoot, beliefIds, tombstones, agentPubKey }` is signed with the
  agent's **Ed25519** key.
- Manifest stored on Walrus (gets a content-addressed blob ID) and the root is **anchored on Sui**
  (see [03-architecture.md](03-architecture.md) for option A vs B).
- `parent` links make the commits a hash chain — history can't be rewritten without breaking it.

## 2. Decision receipts

**Plain:** Every time the agent does something, it writes a signed note saying exactly which
beliefs it used and which snapshot they came from.

**Detail:**
- `Receipt { commitId, action, inputHash, beliefIds, merkleProofs[], ts }` signed with Ed25519.
- `merkleProofs` let anyone check each belief was in that commit — without seeing other beliefs.

## 3. Verification (`engram verify`)

1. Verify receipt signature with the agent public key.
2. Verify each Merkle proof against the commit's `merkleRoot`.
3. Fetch manifest from Walrus by blob ID; verify its signature; recompute the root.
4. Query Sui through **Tatum Sui RPC** for the anchor (blob object or `engram::anchor` event);
   confirm root and timestamp.
5. Walk `parent` links if a full-history check is requested.

Walrus Memory's docs say a `verify()` helper is *"on the roadmap"* — Engram ships one.

## 4. Provable forgetting (crypto-shredding)

**Plain:** Walrus can't delete data — it's designed to be permanent. So each memory gets its own
lock. To forget, we destroy the key. The locked data stays, but nobody can ever open it again.

**Detail:**
- Each episode is encrypted client-side with its own random **AES-256-GCM data key (DEK)**
  *before* it goes to Walrus Memory (Walrus Memory then adds its own Seal encryption on top).
- DEKs are wrapped by a master key and kept in the key vault (`.engram/vault`).
- `forget` = securely delete the DEK + add a tombstone to the next commit + retract beliefs that
  depended only on that episode.
- **Limits (be honest in the docs):** it can't un-read copies someone already decrypted; and if the
  public relayer is used for embeddings, the relayer saw plaintext at write time. For strict
  privacy, use Walrus Memory's *manual* mode (client-side embedding) — documented as the
  "strict mode".

## 5. Scoped sharing (`engram share`) — stretch

- Tag beliefs/episodes with scopes (`finance`, `health`, …).
- `share` re-wraps only the DEKs for that scope to the recipient agent's public key (X25519),
  with an expiry in the grant.
- Grant is signed and recorded in a commit, so sharing is auditable.
- Revoke = rotate keys for future data (past shared data can't be "un-shared" — documented).
- **Paid version:** recipient pays per grant via **MPP on Sui (`@suimpp/mpp`)** before the
  wrapped keys are released → this is our entry for *Best Use of Agent Payments*.

## Libraries

| Need | Library |
|---|---|
| sha256 | `@noble/hashes` |
| Ed25519 / X25519 | `@noble/curves` |
| AES-GCM | WebCrypto (`crypto.subtle`) |
| Sui keys & tx | `@mysten/sui` |
| Payments (stretch) | `mppx` + `@suimpp/mpp` |

No custom cryptography: only standard, audited primitives.

# 05: Proof and Privacy

Plain language first, details underneath. Engram uses only standard, well-known primitives
(SHA-256, Ed25519, AES-256-GCM, Merkle trees) and no custom cryptography.

## 1. Commits: one fingerprint for the whole mind

**Plain:** all current beliefs are combined into one fingerprint. Change any belief and the
fingerprint no longer matches.

**Detail:** each belief (and each tombstone) is a leaf. The leaves are sorted into a SHA-256
Merkle tree, and the root goes into a manifest `{ parent, ts, merkleRoot, beliefs, tombstones,
agentPubKey, message }`. The manifest is signed with the agent's Ed25519 key, stored on Walrus,
and its root is anchored on Sui. `parent` links make history a hash chain.

## 2. Receipts: proof of *why*

**Plain:** every decision comes with a signed note: *"I did X, using exactly these beliefs, from
this snapshot."*

**Detail:** `{ action, inputHash, beliefs, commitId, proofs, ts }`, signed with Ed25519. Each
Merkle proof shows that one belief was in the commit **without revealing the other beliefs**.

## 3. Verification: no trust needed

`engram verify` (or **Verify** on the website) checks:

| Check | Proves |
|---|---|
| Receipt signature | The agent really made this decision |
| Belief proofs | Those beliefs were in that commit |
| Commit ID + signature | The snapshot is the agent's and unchanged |
| Merkle root | The beliefs rebuild the exact root |
| History | Every earlier commit is signed and linked |
| Walrus | The manifest is stored on Walrus |
| Sui anchor | The root was public on chain at that time |

Audit bundles (`engram export --audit`) can be checked by anyone with `engram audit <file>`,
with no access to the agent.

## 4. Forgetting: destroy the key, keep the proof

**Plain:** Walrus is permanent, so Engram forgets differently. Each memory has its own lock.
Destroying the key makes the memory unreadable forever, and the next commit records that it
happened.

**Detail:** each episode is encrypted client-side with its own AES-256-GCM key before upload.
Keys are wrapped by a master key in the local vault. `forget` deletes the key, retracts beliefs
that relied only on it, and adds a tombstone to the next commit. Old receipts still verify,
because forgetting is part of the history rather than a rewrite of it.

## 5. What leaves the machine

| Stays with the owner | Goes to Walrus | Goes to Sui | Goes to the dashboard |
|---|---|---|---|
| Agent key, key vault, decrypted memories | Encrypted episodes, beliefs, manifests, receipts | Blob certification, anchor events (Merkle roots) | Commits, beliefs, receipts, re-verified by the server |

## Honest limits

- **Forgetting** can't undo copies that someone already decrypted. Retracted belief *summaries*
  stay in history, marked as retracted.
- **Manifests are encrypted for the owner** by Walrus Memory, so third parties confirm the blob
  exists on Walrus and check the content through the public Merkle root on Sui.
- **Keys live on disk** in `.engram/` today. Moving them to a KMS or to Seal is planned.

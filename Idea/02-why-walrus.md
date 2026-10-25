# 02: Why Walrus (and Sui, and Tatum)

## The short answer

Memory you want to **trust** shouldn't depend on trusting whoever runs the server.
Engram needs four things from its storage, and Walrus gives all four:

| Engram needs… | Walrus provides… |
|---|---|
| Memory no single party can quietly change or delete | Decentralised storage across independent nodes |
| A stable ID for every saved item, to point at in proofs | Every blob has an ID, recorded as an object on Sui |
| Privacy: only the owner can read raw memories | Walrus Memory encrypts data for its owner (Seal) |
| A public clock, so history can't be backdated | Sui transactions and checkpoints |

> **Private memory, stored openly, that anyone can verify.**

## How each piece is used

### Walrus Memory: where everything lives
- **Episodes** (raw memories), **beliefs**, **commit manifests** and **receipts** are each
  stored in their own Walrus Memory namespace (`engram-<agent>-episodes`, `-beliefs`, …).
- Episodes are encrypted by Engram with a per-memory AES-256-GCM key **before** they reach Walrus
  Memory, which then adds its own encryption. That makes provable forgetting possible.
- Semantic recall from Walrus Memory picks the beliefs that matter for each decision
  (`mind.beliefs({ about: "rent" })`).
- `verify` recalls the commit manifest from Walrus Memory and checks it matches.
- A user's agent can run on **their own** Walrus Memory account. The web app sets this up with
  two wallet-signed transactions.

### Sui: the public timestamp
- Each commit's manifest blob is a Walrus `Blob` object on Sui. Its certification proves *when*
  the manifest existed.
- Our Move module **`engram_anchor`** emits an `Anchored` event with the commit ID, Merkle root,
  agent key and parent. So the root itself is public on chain, readable by anyone.
- History is hash-linked: each commit names its parent, so it can't be rewritten without
  breaking the chain.

### Tatum: reading the chain
- Every Mainnet chain read goes through **Tatum's Sui gateway**: Walrus Blob objects, anchor
  transactions and wallet activity. When Sui switched off JSON-RPC, we moved to Tatum's gRPC
  gateway with a native gRPC transport.
- The money-ops agent reads its owner's wallet through Tatum and turns transactions into
  episodes.

## What only works because of this stack

- **`engram verify`** checks a decision against data no one could have edited: the signature,
  the Merkle proof, the manifest on Walrus and the anchor on Sui.
- **Linked dashboards stay honest.** When your agent syncs to the Engram website, the server
  re-checks every signature, root and Sui anchor before showing anything. It can't read your
  private memories, but it can confirm each manifest is stored on Walrus through the public
  aggregator.
- **Forgetting with proof.** Walrus is permanent by design, so Engram forgets by destroying the
  key. The next commit records a tombstone, and the encrypted data becomes unreadable.

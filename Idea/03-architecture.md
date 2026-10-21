# 03 — Architecture

## Big picture

```
                       DEVELOPER'S PROJECT
 ┌────────────────────────────────────────────────────────────────┐
 │  Their agent (any framework)                                   │
 │        │  mind.wrap(agent)                                     │
 │        ▼                                                       │
 │  ┌──────────────────────── ENGRAM SDK ───────────────────────┐ │
 │  │                                                           │ │
 │  │  ① Ingest ──▶ ② Episodic store ──▶ ③ Consolidator ("sleep")│ │
 │  │                                          │                │ │
 │  │                                          ▼                │ │
 │  │  ⑥ Receipts ◀── ⑤ Agent runtime ◀── ④ Belief store         │ │
 │  │       │                                  │                │ │
 │  │       ▼                                  ▼                │ │
 │  │  ⑦ Commit engine (Merkle root + signature + anchor)       │ │
 │  │                                                           │ │
 │  │  ⑧ Key vault (per-memory keys → forget / share)           │ │
 │  └──────────┬───────────────────────────────┬────────────────┘ │
 │             │                               │                  │
 │      engram CLI                       engram ui (inspector)    │
 └─────────────┼───────────────────────────────┼──────────────────┘
               │                               │
     ┌─────────▼─────────┐           ┌─────────▼─────────┐
     │  WALRUS MEMORY    │           │  SUI (Mainnet)    │
     │  (via relayer /   │           │  commit anchors   │
     │   SDK) — all      │           │  MemWal account   │
     │   episodes,       │           └─────────▲─────────┘
     │   beliefs,        │                     │ read / verify
     │   manifests       │           ┌─────────┴─────────┐
     └───────────────────┘           │  TATUM            │
                                     │  Sui RPC + Data   │
                                     │  API              │
                                     └───────────────────┘
```

## Components

| # | Component | Responsibility | Storage |
|---|---|---|---|
| ① | **Ingest** | Accepts events: agent observations, tool results, user feedback, external data (e.g. Tatum wallet txs) | — |
| ② | **Episodic store** | Saves each event as an immutable *episode* (encrypted with its own key) | Walrus Memory, namespace `engram/episodes` |
| ③ | **Consolidator** | Scheduled or manual "sleep": clusters new episodes, uses an LLM to propose beliefs, checks contradictions against existing beliefs, revises or creates beliefs | runs locally / server |
| ④ | **Belief store** | Versioned beliefs: statement, confidence, evidence (episode IDs), `supersedes` link | Walrus Memory, namespace `engram/beliefs` |
| ⑤ | **Agent runtime hook** | Before the agent acts, injects the relevant active beliefs; after it acts, captures the decision | — |
| ⑥ | **Receipts** | Signed record of each decision: action, belief IDs used, commit ID, Merkle proofs | Walrus Memory, namespace `engram/receipts` |
| ⑦ | **Commit engine** | Builds a Merkle tree over active beliefs, signs the manifest, stores it on Walrus, anchors the root on Sui | Walrus + Sui |
| ⑧ | **Key vault** | Holds per-episode data keys (wrapped by a master key); destroying a key = forget | local encrypted file (hackathon) → Seal / KMS later |
| — | **CLI** | `engram init / log / diff / checkout / blame / bisect / commit / verify / forget / share / ui` | — |
| — | **Inspector** | Local web app: belief graph, timeline slider, diffs, receipt verification | — |

## Data model (simplified)

```ts
Episode {
  id: string            // engram ID
  blobId: string        // Walrus blob ID (from rememberAndWait)
  ts: number
  source: "user" | "tool" | "tatum" | "agent"
  contentHash: string   // sha256 of plaintext (before encryption)
  keyId: string         // which data key encrypts it
}

Belief {
  id: string
  version: number
  statement: string     // "Owner pays rent to 0x7a… on the 1st"
  confidence: number    // 0..1
  evidence: string[]    // episode IDs
  supersedes?: string   // previous belief version
  status: "active" | "revised" | "retracted" | "forgotten"
}

Commit {
  id: string
  parent?: string
  ts: number
  merkleRoot: string    // over active beliefs (+ tombstones)
  beliefs: string[]     // active belief IDs
  tombstones: string[]  // forgotten episode IDs
  agentPubKey: string
  signature: string     // Ed25519 over the manifest
  manifestBlobId: string
  anchorTx?: string     // Sui transaction digest
}

Receipt {
  id: string
  commitId: string
  action: string
  inputHash: string
  beliefIds: string[]
  proofs: MerkleProof[] // each belief is in commit.merkleRoot
  signature: string
}
```

## Main flows

### A. Learning (episodes → beliefs)
1. Agent or data source emits an event → **Ingest** → encrypt with a new data key → store via
   Walrus Memory → episode recorded.
2. `engram sleep` (cron or manual): Consolidator takes new episodes, asks the LLM:
   *"Given these episodes and current beliefs, which beliefs are new, strengthened, weakened
   or contradicted?"*
3. New belief versions are written; contradicted ones become `revised` (kept in history).
4. **Commit engine** creates a commit → manifest on Walrus → root anchored on Sui.

### B. Acting (beliefs → decision → receipt)
1. Before the agent acts, the runtime hook loads active beliefs relevant to the task.
2. Agent decides; hook records which beliefs it used.
3. A signed **receipt** with Merkle proofs is stored.

### C. Verifying
`engram verify <receipt>`:
1. Check the receipt signature (agent's public key).
2. Check each belief's Merkle proof against the commit's root.
3. Fetch the commit manifest from Walrus; check its signature.
4. Use **Tatum Sui RPC** to read the anchor transaction / object and confirm the root and
   timestamp on-chain.
→ "This decision was made on this exact memory, at this time, and nothing was changed since."

### D. Time travel
`engram checkout <commit|date>` loads the belief set from that commit's manifest, so the agent
(or the inspector) runs with the memory it had then. `diff` compares two belief sets.

### E. Bisect
`engram bisect start --good <commit> --bad <commit>` → binary search over commits; at each
step, the agent runs a test prompt with that memory; a predicate (or the user) marks good/bad →
reports the first commit (and belief) that introduced the bad behaviour.

### F. Forget
`engram forget <episode>` → destroy that episode's data key → next commit lists it as a
tombstone → any belief relying only on it is retracted. The ciphertext stays on Walrus but can
never be decrypted again.

## Sui anchoring — two options (decide on day 1)

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. Reuse Walrus blob object** | Manifest is stored as a Walrus blob, which already creates a Sui object with a registration time; `verify` reads it via Tatum Sui RPC | No contract to deploy, no extra cost | Proof is indirect (blob existence + time) |
| **B. Tiny Move module `engram::anchor`** | Each commit calls `anchor(root, parent)`, emitting an event / storing in a table | Clean, explicit, queryable history | Must write + deploy a contract; small gas per commit |

Hackathon default: **A**, upgrade to **B** if time allows (B looks stronger to judges).

## Tech stack (proposed)

| Part | Choice |
|---|---|
| Language | TypeScript (Node 20+) |
| Monorepo | pnpm workspaces: `packages/sdk`, `packages/cli`, `apps/inspector`, `examples/money-ops` |
| Walrus | Walrus Memory TS SDK (`memwal`, `rememberAndWait`, `recall`) — manual mode where we need client-side encryption |
| Sui | `@mysten/sui` for keys/tx; **Tatum Sui RPC** endpoint for all reads/verification |
| Crypto | `@noble/hashes` (sha256), `@noble/curves` (Ed25519), AES-GCM via WebCrypto |
| LLM | Claude API for consolidation and the example agent |
| CLI | `commander` + `ink` (nice terminal output) |
| Inspector | Vite + React + a graph lib (e.g. react-flow) |
| Tests | Vitest |
| Payments (stretch) | `mppx` + `@suimpp/mpp` (MPP, Sui USDC) |

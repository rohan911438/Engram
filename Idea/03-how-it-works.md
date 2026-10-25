# 03: How It Works

## The big picture

```mermaid
flowchart TB
    subgraph L1["Access layer"]
        direction LR
        AGENT["Your AI agent<br/>(SDK: engram · wrap)"]
        CLI["CLI<br/>npx @rohankumar4179/engram"]
        MCP["MCP server<br/>Claude Code · Cursor"]
        BROWSER["Browser + Sui wallet<br/>dashboard · docs · demo"]
    end

    subgraph L2["Engram layer"]
        direction LR
        CORE["<b>Engram core</b><br/>observe · sleep · commit · decide<br/>verify · forget · link<br/><i>keys + key vault stay local</i>"]
        API["<b>Engram API</b> (Render)<br/>wallet auth · hosted agents<br/>linked dashboards · live verify"]
    end

    subgraph L3["Services"]
        direction LR
        LLM["Gemini<br/>episodes → beliefs"]
        TATUM["Tatum<br/>Sui gRPC gateway"]
    end

    subgraph L4["Decentralised storage and proof"]
        direction LR
        WALRUS[("<b>Walrus Mainnet</b><br/>Walrus Memory + Seal<br/>episodes · beliefs · manifests · receipts")]
        SUI[("<b>Sui</b><br/>Walrus Blob objects<br/>engram_anchor events")]
    end

    AGENT --> CORE
    CLI --> CORE
    MCP --> CORE
    BROWSER --> API
    CORE -- "sync audit bundle" --> API
    CORE -- "sleep" --> LLM
    CORE -- "store encrypted" --> WALRUS
    CORE -- "anchor root" --> SUI
    CORE -- "read chain" --> TATUM
    API -- "re-verify" --> TATUM
    TATUM --> SUI
    WALRUS -. "blob registered on" .-> SUI

    classDef engram fill:#d4ff3a,stroke:#0a0a09,color:#0a0a09
    classDef access fill:#ffffff,stroke:#555,color:#0a0a09
    classDef svc fill:#fff4e6,stroke:#ff7a45,color:#0a0a09
    classDef dec fill:#eef4ff,stroke:#3b5bdb,color:#0a0a09
    class CORE,API engram
    class AGENT,CLI,MCP,BROWSER access
    class LLM,TATUM svc
    class WALRUS,SUI dec
```

### Memory lifecycle

```mermaid
flowchart LR
    IN["Wallet tx<br/>user message<br/>tool result"] --> OBS["1 · observe"]
    OBS --> EP["Episode<br/>encrypted with its own key"]
    EP --> SLEEP["2 · sleep<br/>LLM consolidation"]
    SLEEP --> BEL["Beliefs<br/>versioned · confidence · evidence"]
    BEL --> COMMIT["3 · commit<br/>Merkle root + Ed25519 signature"]
    COMMIT --> PROOF["Manifest on Walrus<br/>root anchored on Sui"]
    BEL --> DECIDE["4 · decide / wrap<br/>relevant beliefs in"]
    DECIDE --> REC["Signed receipt<br/>Merkle proofs into HEAD"]
    REC --> VERIFY["5 · verify<br/>anyone, anytime"]
    PROOF --> VERIFY
    PROOF --> SYNC["6 · link / sync<br/>web dashboard"]

    classDef step fill:#d4ff3a,stroke:#0a0a09,color:#0a0a09
    classDef data fill:#1b1b19,stroke:#d4ff3a,color:#f3efe6
    class OBS,SLEEP,COMMIT,DECIDE,VERIFY,SYNC step
    class EP,BEL,PROOF,REC data
```

## The five building blocks

| Block | What it is | Where it lives |
|---|---|---|
| **Episode** | Something the agent saw: a message, a wallet transaction, a tool result. Encrypted with its own key. | Walrus Memory (+ local index) |
| **Belief** | What the agent concluded, e.g. *"Rent is 520 USDC to 0x7a11 on the 1st"*. Has a version, a confidence score and links to its evidence. | Walrus Memory |
| **Commit** | A snapshot of all beliefs: Merkle root, parent commit, Ed25519 signature. | Manifest on Walrus, root anchored on Sui |
| **Receipt** | A signed record of one decision, with Merkle proofs for the beliefs it used. | Walrus Memory |
| **Tombstone** | A record that an episode was forgotten, included in the next commit. | Inside the commit |

```mermaid
classDiagram
    direction LR
    class Episode {
        id: ep_…
        source: user | tool | tatum | agent
        keyId: own AES-256-GCM key
        contentHash: sha256
        blobId: Walrus blob
    }
    class Belief {
        id: b_…
        version: n
        statement
        confidence: 0..1
        evidence: episode IDs
        status: active | revised | retracted
    }
    class Commit {
        id: sha256 of manifest
        parent: commit ID
        merkleRoot
        beliefs: id@version
        tombstones: episode IDs
        signature: Ed25519
        manifestBlobId
        anchor: Sui tx + checkpoint
    }
    class Receipt {
        id: r_…
        action
        inputHash
        beliefs used
        proofs: Merkle
        commitId
        signature: Ed25519
    }
    Episode "many" --> "1..many" Belief : evidence for
    Belief "many" --> "1" Commit : snapshotted in
    Commit --> Commit : parent
    Receipt --> Commit : proven against
    Receipt --> Belief : used
```

## The main flows

### Learning: `observe` → `sleep` → `commit`
1. `observe` encrypts the episode (AES-256-GCM, new key) and stores it.
2. `sleep` sends new episodes and current beliefs to an LLM, which proposes **new**, **revised**
   or **retracted** beliefs. Every proposal must cite real episode IDs, and ungrounded ones are rejected.
3. `commit` builds a Merkle tree over the beliefs, signs the manifest, saves it on Walrus and
   anchors the root on Sui.

```mermaid
sequenceDiagram
    autonumber
    participant D as Developer / agent
    participant E as Engram SDK
    participant W as Walrus Memory
    participant S as Sui (engram_anchor)
    participant T as Tatum gRPC

    D->>E: commit("week 2")
    E->>W: push pending episodes, beliefs, receipts
    W-->>E: Walrus blob IDs
    E->>E: Merkle tree over beliefs + tombstones
    E->>E: manifest {parent, root, beliefs, blob IDs}, signed with Ed25519
    E->>W: store manifest
    W-->>E: manifest blob ID
    E->>S: anchor(agent key, commit ID, root, parent, manifest blob)
    S-->>E: Anchored event in checkpoint N
    E->>T: read back Blob object and anchor
    T-->>E: confirmed on chain
    E-->>D: commit 19040b51, root 392bf9cb…, anchored
```

### Acting: `decide` / `mind.wrap()`
Before the agent acts, Engram hands it the relevant beliefs. After it acts, Engram writes a
**receipt** naming the beliefs used, with a Merkle proof for each.

### Verifying: `verify`
For a receipt or commit, Engram checks, in order:
receipt signature → belief Merkle proofs → commit ID and signature → Merkle root rebuilt →
hash-linked history → manifest on Walrus → anchor on Sui (via Tatum) → anchor time.
The result reads: *"this decision was made on this exact memory, at this time, and nothing
changed since."*

```mermaid
flowchart TB
    R(["Receipt r_…<br/>or commit"]) --> A

    subgraph S1["1 · The decision"]
        direction LR
        A["Receipt signature<br/>Ed25519 by the agent"] --> B["Belief Merkle proofs<br/>beliefs are in the commit"] --> T["Timing<br/>decided after the commit"]
    end

    subgraph S2["2 · The snapshot"]
        direction LR
        C["Commit ID = sha256 of manifest<br/>+ Ed25519 signature"] --> D["Merkle root rebuilt<br/>from the beliefs"] --> E["History<br/>every parent signed + linked"]
    end

    subgraph S3["3 · Storage and chain"]
        direction LR
        F["Walrus<br/>manifest is stored"] --> G["Sui anchor via Tatum<br/>same root, public timestamp"]
    end

    T --> C
    E --> F
    G --> OK(["VALID<br/>this decision used exactly this memory"])

    classDef ok fill:#b6f25c,stroke:#0a0a09,color:#0a0a09,font-weight:bold
    classDef chk fill:#ffffff,stroke:#555,color:#0a0a09
    class OK ok
    class A,B,T,C,D,E,F,G chk
```

### Looking back: `log`, `diff`, `checkout`, `blame`, `bisect`
- `checkout HEAD~1` or `checkout 2026-10-20` shows what the agent believed then.
- `blame b_rent` lists the episodes (with Walrus blob IDs) behind a belief.
- `bisect` does a binary search over commits to find where a wrong belief first appeared.

### Forgetting: `forget`
Destroy the episode's key → retract beliefs that depended only on it → the next commit carries
a tombstone. The encrypted data stays on Walrus but can never be opened again.

### Linking to the dashboard: `link` → `sync`
Like `gh auth login`: the CLI shows a code, the owner approves it on the website with their
wallet, and every later commit syncs automatically. Only commits, beliefs and receipts are
uploaded, never raw episodes or keys. The server **re-verifies every upload** before showing it.

## Tech stack

| Part | Choice |
|---|---|
| Language | TypeScript, Node 20+, pnpm monorepo |
| Packages | `packages/sdk`, `packages/cli`, `apps/web`, `apps/server`, `examples/money-ops`, `contracts/engram_anchor` |
| Storage | Walrus Memory (`@mysten-incubation/memwal`) |
| Chain | Sui: `@mysten/sui`, Move module `engram_anchor`; reads via Tatum Sui gRPC |
| Crypto | `@noble/hashes`, Ed25519, AES-256-GCM. Standard primitives only. |
| LLM | Gemini (key rotation, grounded outputs) |
| Web | React + Vite + Tailwind + shadcn/ui, `@mysten/dapp-kit` for wallets |
| Tests | Vitest: SDK 62 · CLI 10 · money-ops 6 · server 20 |

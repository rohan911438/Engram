# Engram

**Git for agent memory.** Version-controlled, provable memory for AI agents, built on
[Walrus Memory](https://docs.wal.app/walrus-memory/getting-started/what-is-walrus-memory.md),
with commits anchored on Sui and verified through Tatum's Sui RPC.

- **Learns:** raw events (episodes) are consolidated into versioned beliefs.
- **Remembers with history:** `log`, `diff`, `checkout`, `blame`, `bisect` over the agent's memory.
- **Proves:** every decision gets a signed receipt with Merkle proofs against an on-chain commit.
- **Forgets:** per-memory encryption keys, so `forget` makes a memory unreadable forever.

> Built for the Tatum × Walrus **Total Recall** hackathon. Work in progress.

## Planned layout

```
packages/sdk        core library
packages/cli        `engram` command line
apps/inspector      web UI: belief graph, timeline, receipt verification
examples/money-ops  example agent watching a Sui wallet
```

## Setup

```bash
cp .env.example .env   # fill in your own keys
pnpm install
```

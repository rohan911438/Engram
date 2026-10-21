# Engram — Git for Agent Memory

> **Every belief traceable. Every decision provable. Every memory forgettable.**

Engram is a developer toolkit (SDK + CLI + local inspector) that gives AI agents a
brain-like, version-controlled memory on top of **Walrus Memory**, with on-chain
proofs checked through **Tatum's Sui RPC**.

Developers add it to their own agent project with one command:

```bash
npx engram init
```

Their agent then gets memory that **learns** (episodes → beliefs), can be
**rewound** (`checkout`), **debugged** (`blame`, `bisect`), **proven**
(`commit`, `verify`) and **forgotten** (`forget`).

---

## Files in this folder

| File | What's inside |
|---|---|
| [01-hackathon.md](01-hackathon.md) | The event: dates, tracks, prizes, rules, judging, submission checklist |
| [02-product.md](02-product.md) | The problem, what Engram is, end goal, how it differs from plain Walrus Memory |
| [03-architecture.md](03-architecture.md) | System design, memory layers, data model, main flows |
| [04-cli-and-sdk.md](04-cli-and-sdk.md) | Every CLI command, the SDK API, the MCP server plan |
| [05-cryptography.md](05-cryptography.md) | Merkle commits, signed receipts, on-chain anchoring, forgetting, sharing |
| [06-who-should-use-it.md](06-who-should-use-it.md) | Target users, use cases, who it's *not* for |
| [07-special-awards.md](07-special-awards.md) | Which $500 special awards we can realistically go for |
| [08-roadmap.md](08-roadmap.md) | Hackathon build plan (day by day) + what comes after |
| [09-risks-and-open-questions.md](09-risks-and-open-questions.md) | What could go wrong and what we must check first |
| [10-references.md](10-references.md) | All links: hackathon, Walrus docs, Tatum docs, payments |

---

## One-minute summary

- **Hackathon:** Total Recall (Tatum × Walrus), online, 20 Oct – 10 Nov 2026, $4,500 pool.
- **Our entry:** Track 02 *Smart Agents for Real Life* + special award *Best Walrus Memory*.
  Stretch: *Best Use of Agent Payments* (paid memory sharing via MPP on Sui).
- **Prize range:** $200 (3rd in track) → $1,000 (1st + Best Walrus Memory) → $1,500 if payments award also lands.
- **What we ship for the hackathon:** SDK, CLI, inspector (`engram ui`), and a money-ops
  example agent that watches a Sui wallet through Tatum and learns its owner's habits.
- **What comes next:** MCP server, framework plug-ins, Python SDK, team dashboard, audit exports,
  paid memory marketplace.
- **Why it can win:** Walrus Memory's own docs list `verify()` as *"on the roadmap"* and have no
  commits, diffs or time-travel. Engram builds exactly that missing layer.

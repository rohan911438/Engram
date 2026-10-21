# 02 — The Product

## The problem

AI agents now remember things (Walrus Memory, Mem0, Zep and others). But their memory is a
**black box that only grows**:

1. **You can't see how it learned.** Memories pile up as loose text. Nothing turns them into
   clear beliefs, and nothing revises a belief when new evidence contradicts it.
2. **You can't debug it.** When an agent starts behaving badly, nobody can tell *which memory*
   caused it, or what the agent "knew" last Tuesday.
3. **You can't prove anything.** If an agent moves money or makes a decision, there is no
   tamper-proof record of *why* — only logs the operator could have edited.
4. **You can't truly forget.** Walrus storage is permanent by design. Privacy rules (right to be
   forgotten) need a way to make data unreadable forever, with proof.
5. **You can't hand memory over safely.** Moving what Agent A learned to Agent B is all or nothing.

## What Engram is

**A version-control and proof layer for agent memory, built on Walrus Memory.**

It adds four things on top of plain memory storage:

| Layer | What it does | Analogy |
|---|---|---|
| **Cognition** | Raw events (episodes) are consolidated in a "sleep" step into beliefs with confidence scores and evidence links; contradictions revise beliefs | How the brain turns experiences into knowledge |
| **Version control** | Every consolidation produces a commit; you can `log`, `diff`, `checkout`, `blame`, `bisect` | Git |
| **Proof** | Commits are Merkle-rooted, signed, stored on Walrus and anchored on Sui; every agent action gets a signed receipt that `verify` can check via Tatum Sui RPC | A notary for the agent's mind |
| **Control** | Per-memory encryption keys allow provable `forget`; scoped, expiring `share` to other agents | Shredding + permission slips |

Delivered as:
- **SDK** (TypeScript) — wraps an existing agent in 3 lines
- **CLI** — `npx engram …` in any project
- **Inspector** — `engram ui` opens a local web view of the agent's mind with a time slider
- **Example agent** — a money-ops agent that watches a Sui wallet via Tatum and learns its owner's habits

## How it differs from plain Walrus Memory

From Walrus Memory's own docs (checked 21 Oct 2026):

| Capability | Walrus Memory today | Engram adds |
|---|---|---|
| Store / recall memories | ✅ | uses it |
| Encrypted at rest (Seal) | ✅ | uses it |
| Blob IDs as revision trail | ✅ (implicit) | turns it into real commits |
| Beliefs, confidence, contradiction handling | ❌ | ✅ consolidation step |
| Commit / diff / checkout / time-travel | ❌ ("versioned datasets" is a DIY pattern) | ✅ |
| `verify()` | ❌ — *"on the roadmap"* | ✅ `engram verify` |
| Signed decision receipts | ❌ | ✅ |
| Blame / bisect | ❌ | ✅ |
| Provable per-memory forgetting | ❌ (deletes Blob objects; no crypto-shredding) | ✅ |
| Scoped, expiring sharing | Delegate keys (whole account) | ✅ per-scope, per-time |

**Pitch angle:** *We built the layer Walrus Memory's own roadmap points to.* Engram is a
complement, not a competitor — it makes Walrus Memory more useful.

## End goal

**Become the standard way to run accountable AI agents:** the way Git became the standard for
code history, Engram becomes the standard for agent memory history.

Concretely, in 12 months:
- Any agent framework (Vercel AI SDK, LangChain, Claude Agent SDK, MCP clients) can add
  Engram in minutes.
- Teams in regulated industries use `commit` + `verify` + audit exports as their evidence that
  an AI decision was made on a known, untampered memory.
- Agents trade learned knowledge through scoped, paid `share` (memory marketplace, MPP/x402 on Sui).

## Pitch lines

- *"Git for agent memory."*
- *"I can debug an AI's mind like code."*
- *"Every belief traceable. Every decision provable. Every memory forgettable."*
- *"Total Recall — and total control."* (ties into the hackathon name)

## Name

Working name **Engram** (neuroscience term for a memory trace). **Check npm / GitHub for name
conflicts before publishing** — fallback names: `mnemo`, `memgit`, `recall-kit`.

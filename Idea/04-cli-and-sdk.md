# 04 — CLI, SDK and MCP

Three ways in, so nobody has to download an app or change how they work.

| Entry point | Effort for the developer | Phase |
|---|---|---|
| CLI (`npx engram`) | One command in their terminal | Hackathon |
| TypeScript SDK | 3 lines around their existing agent | Hackathon |
| MCP server | One config line in Claude Code / Cursor / Claude Desktop | Next |
| Framework plug-ins (Vercel AI SDK, LangChain, Claude Agent SDK) | Import + 1 line | Next |
| Python SDK | Same API in Python | Next |

## CLI commands

| Command | What it does | Phase |
|---|---|---|
| `engram init` | Creates `.engram/` config, agent signing key, key vault; links Walrus Memory account + Tatum key from `.env` | Hackathon |
| `engram status` | Current commit, number of episodes/beliefs, uncommitted changes | Hackathon |
| `engram sleep` | Runs consolidation: episodes → beliefs | Hackathon |
| `engram commit -m "…"` | Merkle root + signature + store manifest on Walrus + anchor on Sui | Hackathon |
| `engram log` | History of commits (what was learned when) | Hackathon |
| `engram diff <a> <b>` | Beliefs learned / revised / dropped between two commits or dates | Hackathon |
| `engram checkout <commit\|date>` | Run the agent with the memory it had then | Hackathon |
| `engram blame <belief>` | Shows the episodes (with Walrus blob IDs) that created a belief | Hackathon |
| `engram verify <receipt\|commit>` | Checks signature, Merkle proofs, manifest on Walrus, anchor on Sui (via Tatum) | Hackathon |
| `engram forget <episode>` | Destroys the episode's key, tombstones it, retracts dependent beliefs | Hackathon |
| `engram ui` | Opens the inspector at `localhost` | Hackathon |
| `engram bisect start/good/bad` | Finds the commit/belief that caused bad behaviour | Hackathon (should-have) |
| `engram share --to <pubkey> --scope <tag> --expires 7d [--price 0.05]` | Scoped, expiring (optionally paid) access for another agent | Stretch / Next |
| `engram export --audit` | Audit bundle (commits, receipts, proofs) as a file | Next |

### Example session

```bash
$ npx engram init
✔ Agent key created (ed25519)  ✔ Walrus Memory linked  ✔ Tatum Sui RPC reachable

$ engram sleep
Consolidated 14 episodes → 2 new beliefs, 1 revised

$ engram commit -m "first week of wallet activity"
✔ commit 7f3a…  root 0x91c4…  anchored on Sui (tx 9Hk2…)

$ engram blame b_rent
b_rent v2  "Owner pays rent to 0x7a… on the 1st" (0.92)
  ← ep_031  2026-10-01  tatum: transfer 450 USDC → 0x7a…   blob 0xab12…
  ← ep_058  2026-11-01  tatum: transfer 450 USDC → 0x7a…   blob 0xcd34…
  ← ep_060  user: "yes that's my rent"                      blob 0xef56…

$ engram verify r_118
✔ signature valid   ✔ 3 beliefs in commit 7f3a…   ✔ manifest on Walrus
✔ anchor confirmed on Sui via Tatum (checkpoint 41,220,118)
```

## SDK (TypeScript) — target API

```ts
import { engram } from "engram-sdk";

const mind = engram({
  agent: "money-ops",
  walrus: { accountId: process.env.MEMWAL_ACCOUNT_ID, key: process.env.MEMWAL_KEY },
  tatum:  { apiKey: process.env.TATUM_API_KEY, network: "sui-mainnet" },
});

// 1. Wrap an existing agent — beliefs injected before, receipts written after
const agent = mind.wrap(myAgent);

// 2. Or use the pieces directly
await mind.observe({ source: "tatum", data: tx });     // episode
await mind.sleep();                                     // consolidate
const commit = await mind.commit("weekly");             // prove
const beliefs = await mind.beliefs({ about: "rent" });  // query
const past = await mind.at("2026-10-25");               // time travel
await mind.forget("ep_058");                            // provable forget
const ok = await mind.verify(receiptId);                // proof check
```

## MCP server (next phase)

Walrus Memory **already ships an MCP server** for Claude Code, Cursor, Codex and others — so a
plain "memory MCP" would add nothing. The **Engram MCP** exposes the *extra* layer as tools:

| MCP tool | Use inside Claude Code / Cursor |
|---|---|
| `engram_beliefs` | "What do you currently believe about this codebase / user?" |
| `engram_blame` | "Why do you think that?" → evidence |
| `engram_commit` | Checkpoint the assistant's memory before a big change |
| `engram_diff` | "What did you learn this week?" |
| `engram_forget` | "Forget that — it was wrong / private" |
| `engram_verify` | Proof for a past decision |

Install target:
```json
{ "mcpServers": { "engram": { "command": "npx", "args": ["engram", "mcp"] } } }
```

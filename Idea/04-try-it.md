# 04: Try It

Three ways to use Engram, plus the website. Full docs: https://engram-blond.vercel.app/docs

## 1. Just look (30 seconds, no setup)

Open the **live demo agent**: https://engram-blond.vercel.app/demo

It's a money-ops agent that watched a wallet making real transfers. Things to try:
- **Mind**: the belief graph. Drag the time slider to watch beliefs appear and change.
- **History**: each commit, what changed, and its Walrus and Sui links.
- **Receipts**: open the CRITICAL alert for the scam-address payment and press **Verify**.

## 2. CLI

Needs Node 20+ and a `.env` with Walrus Memory, Tatum and Gemini keys
(see [the docs](https://engram-blond.vercel.app/docs#configuration)).

```bash
npx @rohankumar4179/engram init my-agent
npx @rohankumar4179/engram observe "I pay 450 USDC rent to 0x7a11 on the 1st"
npx @rohankumar4179/engram sleep
npx @rohankumar4179/engram commit -m "first week"
npx @rohankumar4179/engram verify
```

On Windows PowerShell, use `npx.cmd` instead of `npx`.

| Command | What it does |
|---|---|
| `init <agent>` | New agent: signing key, key vault, Walrus Memory namespaces |
| `observe` | Record an encrypted episode |
| `sleep` | Episodes → beliefs (LLM) |
| `commit -m` | Signed snapshot → Walrus → Sui |
| `decide <action> -u <belief>` | Signed decision receipt (in the repo; next npm release) |
| `verify [ref]` | Check a receipt or commit end to end |
| `log` · `diff` · `checkout` | History, changes, memory at any point |
| `blame <belief>` · `bisect` | Evidence behind a belief; find where it went wrong |
| `forget <episode>` | Destroy the key, retract, tombstone |
| `export --audit` · `audit <file>` | A bundle anyone can verify without the repo |
| `link` · `sync` | Connect to the web dashboard with your wallet |
| `ui` | Local inspector |
| `mcp` | Run as an MCP server |

## 3. SDK

```ts
import { engram } from "@rohankumar4179/engram-sdk";

const mind = engram({ agent: "money-ops" });

// Wrap your existing agent: relevant beliefs in, signed receipt out.
const agent = mind.wrap(async (tx, beliefs) => myAgent.decide(tx, beliefs));
const decision = await agent(tx);
agent.lastReceipt;                       // r_… with Merkle proofs

mind.observe({ source: "tatum", data: tx });
await mind.sleep();
await mind.commit("weekly");
await mind.verify(agent.lastReceipt!.id);
```

## 4. MCP (Claude Code, Cursor, Claude Desktop)

```json
{ "mcpServers": { "engram": { "command": "npx", "args": ["@rohankumar4179/engram", "mcp", "-C", "/path/to/agent"] } } }
```

Tools: `engram_remember`, `engram_beliefs`, `engram_sleep`, `engram_commit`, `engram_log`,
`engram_diff`, `engram_blame`, `engram_forget`, `engram_verify`, `engram_status`.

## 5. The web app

- **Sign in** with any Sui wallet. It's one free signature, never a transaction.
- **Your agent**: a hosted agent that reads your wallet through Tatum and learns from what you tell it.
- **Your agents**: CLI/SDK agents you linked with `engram link`. Read-only, re-verified on every sync.
- **Verify** on any page runs the full proof check live.

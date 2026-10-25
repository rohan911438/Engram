# 08: What's Built, and What's Next

## Built during the hackathon (20 Oct – 10 Nov 2026)

| Area | Status |
|---|---|
| SDK: episodes, consolidation, beliefs, commits, receipts, verify, forget | Done |
| CLI: `init` · `observe` · `sleep` · `commit` · `log` · `diff` · `checkout` · `blame` · `bisect` · `verify` · `forget` · `export`/`audit` · `link`/`sync` · `ui` · `mcp` | Done, published on npm |
| `decide` command for CLI receipts | Done, in the repo, next npm release |
| MCP server (10 tools) | Done |
| Move module `engram_anchor`, Merkle root as a public Sui event | Done, live on Sui Testnet |
| Tatum Sui gRPC gateway for chain reads | Done |
| Money-ops example agent on real wallet transactions | Done |
| Web app: wallet sign-in, hosted agent, linked agents, live verify, public demo, docs | Done, live |
| Per-user Walrus Memory accounts from the browser | Done |
| Tests: SDK 62 · CLI 10 · money-ops 6 · server 20 | Done, all passing |

## Next (Nov 2026 → Q1 2027)

- **Move anchor on Sui Mainnet**, so roots are public on Mainnet as well as Testnet.
- **Framework plug-ins** for the Vercel AI SDK, LangChain, the Claude Agent SDK and Mastra.
- **Python SDK** with the same API.
- **Scoped sharing:** hand part of a memory (e.g. only `finance` beliefs) to another agent, with an expiry.
- **Persistent hosted storage** for the dashboard, so linked agents never need a re-sync.

## Later (2027)

- **Team dashboard:** many agents, team members, alerts when a belief changes.
- **Paid memory sharing:** agents sell scoped knowledge through MPP / x402 on Sui, with proof
  of exactly what was sold.
- **Keys in Seal or a KMS** instead of on disk.
- **Public verification page:** paste a receipt, get a verdict, no install needed.

## What success looks like

Developers reach for Engram when they need to **debug** an agent, teams use it to **audit**
one, and users trust an agent because they can **check** what it remembered.

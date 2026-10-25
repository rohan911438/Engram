# 07: How Engram Meets the Judging Criteria

**Hackathon:** Total Recall (Tatum × Walrus), 20 Oct – 10 Nov 2026
**Track:** 02, *Smart Agents for Real Life*: agents that watch expenses, habits and workflows,
and pick up where they left off.
**Special award:** *Best Walrus Memory*: "Deepest learning loop. Memories that visibly change the product."

---

## Walrus and Tatum integration (30%)

| What | Where to see it |
|---|---|
| Walrus Memory stores every layer: episodes, beliefs, manifests, receipts, each in its own namespace | `packages/sdk/src/remote.ts`, `engram.ts` |
| Walrus Memory semantic recall chooses the beliefs for each decision | `mind.beliefs({ about })`, `mind.wrap()` |
| `verify` recalls the manifest from Walrus Memory; the dashboard confirms blobs via the Walrus aggregator | Verify button on any agent page |
| Per-user Walrus Memory accounts, set up from the browser with wallet-signed transactions | `packages/sdk/src/memwal-account.ts` |
| Tatum Sui gRPC gateway for every Mainnet read: Blob objects, anchor txs, wallet activity | `packages/sdk/src/tatum.ts` |
| The money-ops agent's wallet feed comes from Tatum | `examples/money-ops/src/feed.ts` |
| Move module `engram_anchor` puts each Merkle root on Sui as a public event | `contracts/engram_anchor` |

## Technical quality (30%)

- A real system across six packages (SDK, CLI, web app, server, example agent, Move contract).
- **98 automated tests**: SDK 62 · CLI 10 · money-ops 6 · server 20. They include tamper tests
  (forged receipt, edited belief, forged proof, fake anchor, history rewrite).
- Standard cryptography only. LLM output is **grounded**: beliefs must cite real episode IDs.
- Robust in production: key rotation for the LLM, retries on relayer errors, a Walrus Memory
  fallback mode, per-client rate limits, a health endpoint with a status banner, and sign-in and
  link tokens that survive server restarts.
- Published on npm: `@rohankumar4179/engram` (CLI) and `@rohankumar4179/engram-sdk`.

## Creativity (20%)

- **Git for an agent's mind:** `commit`, `diff`, `checkout`, `blame`, `bisect`.
- **The agent "sleeps"** to turn experiences into beliefs, like human memory consolidation.
- **Provable forgetting** on permanent storage: destroy the key, keep a tombstone.
- **Receipts** prove *which* beliefs drove a decision, without revealing the rest.

## Presentation (20%)

- Live web app with a public demo, docs and wallet sign-in: https://engram-blond.vercel.app
- Docs page for integrators: https://engram-blond.vercel.app/docs
- Demo video, [blog post](https://dev.to/roan911/your-ai-agent-remembers-everything-can-it-prove-any-of-it-51og) and README.

## Best Walrus Memory: a learning loop you can watch

The demo agent's behaviour visibly changes because of what it remembers:

| Period | What the agent does | Why |
|---|---|---|
| Month 1 | Alerts on every payment (nothing learned yet) | No beliefs |
| Months 2–3 | Stays quiet on rent and salary | Learned beliefs, each with a receipt |
| Month 4 | Notices the rent increase and learns a scam address | Beliefs revised |
| Month 5 | **CRITICAL** alert on a payment to the scammer | Remembered belief, proven by a receipt that verifies on Walrus and Sui |

Every one of those changes is a commit you can `diff`, every belief can be `blame`d back to its
memories, and every alert can be `verify`d.

## Submission checklist

- [x] Walrus Memory integrated, writing on Mainnet
- [x] Tatum Sui RPC (gRPC gateway) used for on-chain reads
- [x] 10+ memories stored
- [x] Working demo: live app + video
- [x] Public repo
- [x] Published blog post ([dev.to](https://dev.to/roan911/your-ai-agent-remembers-everything-can-it-prove-any-of-it-51og))

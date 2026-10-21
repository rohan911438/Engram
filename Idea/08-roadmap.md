# 08 — Roadmap

Today: **Wed 21 Oct 2026**. Deadline: **Tue 10 Nov 2026, 17:00 UTC**. ~20 days.

## Phase 1 — Hackathon (21 Oct → 10 Nov)

Deliverables: **SDK, CLI, inspector, money-ops example agent**, blog post, demo video, repo.

### Week 1 (21 – 27 Oct): foundations + spikes

| Day | Work | Owner |
|---|---|---|
| 21–22 Oct | Spikes: Walrus Memory SDK on Testnet (does `rememberAndWait` return blob IDs? manual mode?), Tatum Sui RPC reads, anchoring option A vs B | Claude |
| 21–22 Oct | Create Tatum account + API key; create Walrus Memory agent in dashboard; Sui wallet; register for hackathon; ask Discord about award stacking | **You** |
| 23–24 Oct | Monorepo setup; SDK: episodes (encrypt → Walrus), key vault | Claude |
| 25–27 Oct | SDK: consolidator ("sleep") with Claude API; belief store with versions | Claude |
| (half day) | Spike `@suimpp/mpp` on Testnet — go / no-go for payments award | Claude |

### Week 2 (28 Oct – 3 Nov): proof layer + CLI + example agent

| Day | Work |
|---|---|
| 28–29 Oct | Commit engine: Merkle tree, Ed25519 signing, manifest on Walrus, Sui anchor |
| 30–31 Oct | Receipts + `verify` (incl. Tatum Sui RPC check); `forget` with tombstones |
| 1–2 Nov | CLI: `init, status, sleep, commit, log, diff, checkout, blame, verify, forget` |
| 2–3 Nov | Money-ops example agent: Tatum Data API wallet feed → episodes → beliefs → alerts |

### Week 3 (4 – 10 Nov): inspector, Mainnet, submission

| Day | Work | Owner |
|---|---|---|
| 4–5 Nov | Inspector (`engram ui`): belief graph, timeline slider, diff view, receipt verify button | Claude |
| 6 Nov | `bisect` (should-have); paid `share` via MPP (only if spike was a go) | Claude |
| **7 Nov** | **Feature freeze.** Switch to **Mainnet**, write 10+ real memories, run a full demo scenario | Claude + **You** (fund wallet) |
| 8 Nov | README, docs, tests green, deploy inspector demo (Vercel) | Claude |
| 9 Nov | Blog post (Claude drafts, you publish); record demo video (Claude writes script) | Both |
| **10 Nov (before 17:00 UTC)** | **Submit** + post on X / LinkedIn | **You** |

### Cut order if we fall behind
1. Paid `share` (payments award)
2. `bisect`
3. Inspector graph animation (keep static graph + slider)
4. Sui anchoring option B (fall back to option A)

**Never cut:** episodes → beliefs, commit, verify via Tatum, forget, 10+ Mainnet memories,
blog post, demo.

## Phase 2 — Next (Nov 2026 → Q1 2027)

- **Engram MCP server** — git/proof tools for Claude Code, Cursor, Codex, Claude Desktop
- **Framework plug-ins** — Vercel AI SDK middleware, LangChain, Claude Agent SDK, Mastra
- **Python SDK** — same API (Walrus Memory already has a Python SDK with LangChain/OpenAI wrappers)
- `share` with scopes + revocation (free version)
- Publish to npm / PyPI, docs site, example gallery
- Apply to Walrus / Sui ecosystem grants

## Phase 3 — Later (2027)

- **Team dashboard** (hosted): multiple agents, team members, alerts on belief changes
- **Audit exports** for compliance (signed bundles of commits + receipts)
- **Memory marketplace**: agents sell scoped knowledge via MPP / x402 on Sui
- `engram::anchor` Move package with richer on-chain history and public verification page
- Optional TEE consolidation (Walrus Memory relayer already supports Nautilus TEE)

## Success metrics

| Phase | Metric |
|---|---|
| Hackathon | Track 02 placing + Best Walrus Memory |
| Next | 100 GitHub stars, 20 projects using the SDK, MCP listed in Walrus docs/community |
| Later | First paying team; first paid memory share on Mainnet |

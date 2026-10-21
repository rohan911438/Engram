# 09 — Risks and Open Questions

## Check first (week 1)

| # | Question | Why it matters | How we check |
|---|---|---|---|
| 1 | Can one project win a track prize **and** special awards? | Decides if the payments stretch is worth it | **You:** ask in Tatum Discord |
| 2 | Does the Walrus Memory TS SDK return blob IDs on write (`rememberAndWait`) and on recall? | `blame` and commits need blob IDs | Testnet spike (docs suggest yes) |
| 3 | Can we list all memories in a namespace? | Needed to rebuild state / `checkout` | Read SDK usage docs + spike; fallback: keep our own index in the manifest |
| 4 | Manual mode (client-side encryption/embedding) — usable via public relayer? | Needed for strict-mode `forget` | Spike |
| 5 | Sui anchoring: reuse blob object (A) or deploy Move module (B)? | Proof strength vs effort | Try A first; B if time |
| 6 | Tatum Sui RPC + Data API: which methods for object reads, tx lookup, wallet history? | Core of the 30% integration score | Read Tatum Sui docs + spike |
| 7 | `@suimpp/mpp` works on Sui Testnet/Mainnet? | Payments award go / no-go | Half-day spike |
| 8 | Is the name "Engram" free on npm/GitHub? | Avoid confusion / conflicts | Search before publishing |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Scope too big for 20 days | Medium | High | Strict cut order (see roadmap); feature freeze 7 Nov |
| Walrus Memory SDK lacks a needed feature | Medium | Medium | Use lower-level Walrus SDK for manifests; keep own index |
| Public relayer limits or downtime | Low–Medium | Medium | Self-host relayer, or pay storage directly (cents) |
| LLM consolidation produces noisy beliefs | Medium | Medium | Structured output, confidence thresholds, user confirm step in demo |
| Judges see it as "dev tool, not real-life agent" (Track 02) | Medium | Medium | Lead the demo with the money-ops agent doing real work; tooling is how it's proven |
| "Forget" overclaims privacy | Low | Medium | Document limits clearly (relayer saw plaintext unless strict mode) |
| Payments package immature | Medium | Low | It's a stretch; drop without hurting the core |
| Mainnet costs | Low | Low | Expected < $5 total (SUI gas + a little WAL) |

## Things only you (the user) can do

- Create accounts: Tatum (API key + account ID), Walrus Memory dashboard (agent + delegate key)
- Create/fund a Sui wallet (a few dollars of SUI; WAL only if self-funding storage)
- Put keys in `.env` yourself — **never paste private keys into chat**
- Register, submit the form, publish the blog post, post on X / LinkedIn
- Ask Discord about award stacking

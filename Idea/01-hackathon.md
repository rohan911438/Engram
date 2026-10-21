# 01 — The Hackathon: Total Recall (Tatum × Walrus)

Official page: https://tatum.io/hackathon/total-recall
(content is embedded from https://recall-tatum-walrus.vercel.app/)

## Basics

| | |
|---|---|
| Dates | **20 Oct – 10 Nov 2026** (build window) |
| Format | Fully online, open globally, solo or teams |
| Prize pool | **$4,500** |
| Theme | "Apps that remember" — products that get sharper over time using Walrus Memory |
| Existing projects | Allowed, if the submitted work is new progress made during the build window |

## Timeline

| Date | What happens |
|---|---|
| 20 Oct | Launch, registration opens, Discord office hours start |
| 20 Oct – 10 Nov | Build window |
| **10 Nov, 17:00 UTC** | **Submissions close** (repo, demo, blog post) |
| 11 – 16 Nov | Judging |
| 17 Nov | Winners announced |

## Tracks — $1,000 each (1st $500 · 2nd $300 · 3rd $200)

| # | Track | Brief |
|---|---|---|
| 01 | Markets & Sports Prediction | Prediction apps; track which voices were right; memory stores credibility scores |
| **02** | **Smart Agents for Real Life** ← **our track** | Agents that monitor inboxes, expenses, habits, workflows. *"Portable memory means they pick up where they left off across tools and sessions."* |
| 03 | Consumer Finance Apps | Everyday money tools, blockchain invisible |

Track 02 example ideas from the brief: research agent with source trust scores, expense
watchdog with long-term memory, workflow bots that learn escalation rules.
**Our money-ops example agent sits right inside this brief.**

## Special awards — $500 each, on top of track prizes

| Award | Criteria (from the page) |
|---|---|
| **Best Walrus Memory** ← **our main target** | "Deepest learning loop. Memories that visibly change the product." |
| Best Tatum AI Builder App | "Best shippable product built primarily with ai.tatum.io." |
| Best Use of Agent Payments | "Best app across tracks using x402 or MPP, settled on Sui." |

See [07-special-awards.md](07-special-awards.md) for our analysis of each.

## Judging criteria

| Weight | Criterion | How Engram scores |
|---|---|---|
| 30% | Walrus and Tatum integration | Walrus Memory is the storage for every memory layer; Tatum Sui RPC verifies every commit; Tatum Data API feeds the example agent |
| 30% | Technical quality (clean code, working Tatum Sui RPC) | Real system: layered memory, consolidation job, Merkle commits, signatures, tests |
| 20% | Creativity | Git for an agent's mind — commits, blame, bisect, checkout, provable forgetting |
| 20% | Presentation (docs + working demo) | Visual inspector with time-travel slider; README + blog post |
| Bonus | Share on X / LinkedIn (tag @Tatum_io, @WalrusFoundation optional) | Do it on submission day |

## Submission checklist

- [ ] Walrus Memory integrated and writing on **Mainnet**
- [ ] Tatum RPC used for on-chain data where relevant
- [ ] **At least 10 memories stored on Mainnet**
- [ ] **Published blog post**: what it does, how it uses Tatum + Walrus, how it learned over time
- [ ] Working demo (video + live link if possible)
- [ ] Public repo
- [ ] Tatum dashboard **account ID** (submission form)
- [ ] Walrus Memory **MEMWAL_AGENT_ID** = public key under *Delegate keys* in the Memory dashboard
- [ ] Post on X / LinkedIn for bonus points
- [ ] (Optional) Tatum AI Builder path for its separate $500

## FAQ highlights

- AI Builder is optional; indie builds compete on the same track prizes.
- Tracks "suggest direction. Execution beats novelty. Do not copy the brief verbatim."
- Judging uses the same criteria for AI Builder and indie builds.

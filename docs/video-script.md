# Demo video script (about 3 minutes)

Record at 1080p. Use the dark browser theme and hide bookmarks. Use the live app, or `localhost:8787` with demo data.

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:15 | Homepage hero | "Agents remember things now, but their memory is a black box. You can't see what they believed last week, prove it wasn't edited, or truly delete something. Engram is git for agent memory, built on Walrus Memory, Sui and Tatum." |
| 0:15–0:35 | Click **explore the demo agent** → Overview | "This is money-ops, an agent that watches a real Sui wallet. Every event it saw is a real transfer: we sent real SUI between five wallets, and the agent read them from the chain. The badge says the latest commit is anchored on Sui. Click it and you land on the transaction." |
| 0:35–1:10 | **Mind** → press play on the timeline | "Here is its mind over time. In month one it knows nothing. After the owner explains, three beliefs appear: salary, rent, subscription. For the next two months it stays quiet and gets more confident. In month four the rent changes and a scam happens. Watch the rent belief revise and a new scam-address belief appear." |
| 1:10–1:35 | **Receipts** → the critical alert → **Verify** | "Every decision is a signed receipt that names the beliefs it used. Verify checks the signature, the Merkle proofs into the commit, the manifest on Walrus, and the anchor on Sui, re-read through Tatum. All green." |
| 1:35–1:55 | **History** → open a commit diff | "Commits are hash-linked like git. This diff is exactly what the agent learned in month four: the revised rent, and the new scam address with its evidence." |
| 1:55–2:15 | **Memory** → filter "Owner said" → **Forget** on one episode (own agent, not the demo) | "Forget destroys that memory's encryption key. Beliefs that depended on it are retracted, and the next commit records a tombstone. Old receipts still verify, but the memory itself can never be read again." |
| 2:15–2:40 | Terminal: `engram blame b_monthly_rent`, then `engram bisect HEAD~2 HEAD --grep scam` | "The same history works from the command line. blame shows the episodes and Walrus blobs behind a belief. bisect finds the commit where a belief first appeared." |
| 2:40–3:00 | **Connect wallet** → your agent → **Run** with the live log | "Anyone can connect a Sui wallet and get their own agent. Signing in is a free message signature. It reads your real transactions through Tatum, learns, commits to Walrus and anchors on Sui. Engram: memory you can trust." |

## Before recording

- [ ] The live story has run to the end (`demo/money-ops-live-mainnet`, or `-testnet`).
- [ ] The **Verify** buttons are green. If Walrus Memory is degraded, the Walrus line shows "skipped". Say so honestly, or record after it recovers.
- [ ] Your own agent has at least one committed belief, so the Forget step has something to retract.
- [ ] Terminal font is large (18 pt+) and `engram` is aliased.

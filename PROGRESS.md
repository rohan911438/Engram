# Progress

Plan: `Idea/08-roadmap.md` (local only). Deadline **10 Nov 2026, 17:00 UTC**.
Each milestone: build → validate (tests + real run) → fix → commit & push.

| # | Milestone | Status |
|---|---|---|
| M1 | Monorepo + spikes (Walrus Memory, Tatum Sui RPC, anchoring) | ✅ done — see `docs/spike-findings.md` |
| M2 | SDK core: crypto, Merkle, key vault, local store, episodes → Walrus | ✅ done — 19 tests; live push verified on Sui via Tatum |
| M3 | Consolidator ("sleep") with Gemini + versioned beliefs | ✅ done — 29 tests; live Gemini run revises rent/salary correctly |
| M4 | Commit engine: Merkle root, Ed25519 signature, manifest on Walrus, anchor lookup via Tatum | ✅ done — 36 tests; live anchor found at checkpoint 336512573 |
| M5 | Receipts, `verify`, `forget` (tombstones) | ✅ done — 43 tests; live receipt verified on Walrus + Sui |
| M6 | CLI: init, status, observe, sleep, commit, log, diff, checkout, blame, verify, forget | ⏳ in progress |
| M7 | Money-ops example agent (Tatum wallet feed) | ⬜ |
| M8 | Inspector UI (built on open-source components) | ✅ done — 4 views checked in Chrome; 58 tests total |
| M9 | `bisect`; paid `share` via MPP (stretch) | 🟡 bisect done; paid share blocked on funded wallet |
| M10 | Mainnet demo data, docs, blog draft, video script | ⬜ |

## Log
- **21 Oct** — M1: Walrus Memory write/recall works (blob IDs returned, ~27 s/write). Each memory = Sui `Blob` object readable via Tatum. Tatum has no Sui Testnet.
- **21 Oct** — M2: SDK core. Episodes encrypted per-key (AES-256-GCM), pushed in bulk to Walrus Memory (~36 s for 2), blob IDs confirmed as Sui `Blob` objects via Tatum.
- **21 Oct** — M3: `sleep()` with Gemini (`gemini-flash-latest`, key rotation). Live: 8 wallet episodes → 3 beliefs (rent, payroll, swaps); after rent/raise news → 2 revisions + 1 anomaly belief, 0 rejected ops. Ungrounded LLM output (fake evidence, unknown beliefs) is rejected.
- **21 Oct** — M4: commits (Merkle root over belief leaves + tombstones, Ed25519-signed manifest, hash-chained parents). Manifest stored in Walrus Memory; its Sui `Blob` object + certifying tx found via Tatum → on-chain time. Also `log`, `resolve` (HEAD~n / short id / date), `beliefsAt`, `diff`, `blame`.
  - Manual mode (`rememberManual`) with plaintext bytes returns HTTP 500 — the relayer seems to require Seal-encrypted data, so public plaintext manifests on Walrus aren't possible via Walrus Memory. Stronger anchoring (own Move module with the root in a public event) is planned once a funded Mainnet wallet exists.
- **21 Oct** — M5: signed decision receipts with Merkle proofs; `verifyReceipt`/`verifyCommit` (signature, proofs, root rebuild, hash chain, manifest recalled from Walrus Memory, Blob object + tx re-read via Tatum). `forget` crypto-shreds the key, retracts/revises dependent beliefs, tombstones the next commit. Live: all checks green; old receipt still verifies after forget. Tamper tests: forged receipt, edited belief, forged proof, fake anchor, missing manifest.
- **21 Oct** — M7: `examples/money-ops` — `WalletFeed` (Sui txs via Tatum → events, coin decimals from chain), `MoneyOpsAgent` (batched decisions via `engram.act` → signed receipt per event), `replay` story and `watch <address>`. Replay (`docs/demo-replay.md`): July 4/4 alerted → Aug–Sep 0/8 → Oct rent rise WARN + theft CRITICAL → Nov scam address caught from memory.
  - **Gemini free tier = 20 requests/day per model**, shared by both keys (same Google project). Fixes: batched decisions (~9 calls per replay instead of ~20), daily-quota detection skips exhausted key/model pairs, Gemma models as last fallback (prompt-only JSON).
  - TODO when quota resets: full replay on real Walrus Memory + Sui for the demo repo.
- **21 Oct** — M8: Inspector (`engram ui`) — Vite + React + shadcn/ui (Base UI, MIT) + React Flow + Tailwind, custom dark theme. Views: Overview (stats, learning curve, live Verify HEAD), Mind (belief graph + commit timeline slider with play; new/revised beliefs glow), History (commit diffs, Sui tx + Walrus manifest links, verify), Receipts (decisions, beliefs used, live verify). Local read-only API on 127.0.0.1 in the CLI; checked in Chrome against the replay repo. Path-traversal test included.
- **21 Oct** — M9 (part 1): `bisect` in SDK + CLI (`--grep <regex>` offline, `--ask <question> --expect yes` with the LLM at each commit). Finds the first bad commit in log₂(n) tests and prints the belief diff that caused it. CLI now shortens 64-hex addresses.
  - Paid `share` (MPP on Sui) needs: valid wallet phrase in `.env`, a little SUI + USDC on Mainnet.

## Waiting on the user
- Fix `SUI_MNEMONIC` in `.env` (13 words — one is a typo).
- Gemini quota resets daily (20 requests/model/day on the free tier). More keys from **different Google Cloud projects**, or enabling billing, would remove this limit.
- ~$5 of SUI (+ a few USDC for the payments award) on the wallet before 7 Nov.

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
| M6 | CLI: init, status, observe, sleep, commit, log, diff, checkout, blame, verify, forget | ✅ done |
| M7 | Money-ops example agent (Tatum wallet feed) | ✅ done |
| M8 | Inspector UI (built on open-source components) | ✅ done — 4 views checked in Chrome; 58 tests total |
| M9 | `bisect`; paid `share` via MPP (stretch) | 🟡 bisect done; paid share blocked on funded wallet |
| M10 | Mainnet demo data, docs, blog draft, video script | 🟡 docs, blog draft, video script done; Mainnet anchor publish + deploy waiting on user |

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
- Gemini quota resets daily (20 requests/model/day on the free tier). More keys from **different Google Cloud projects**, or enabling billing, would remove this limit.
- ~$5 of SUI (+ a few USDC for the payments award) on the wallet before 7 Nov.
- **21 Oct** — M9b: `contracts/engram_anchor` (Move: emits `Anchored{commit_id, merkle_root, agent_pubkey, parent, manifest_blob}`), `MoveAnchorer` signs with the wallet and sends through Tatum, `verify` re-reads the event via Tatum and compares root/commit/agent. Enabled by `ENGRAM_ANCHOR_PACKAGE` in `.env`. Gemini: 2 more keys added (4 total).
- **21 Oct** — M11: **Engram web** (`apps/web` + `apps/server`). Premium black homepage (Vengeance UI + Magic UI, MIT; Instrument Serif accents), wallet sign-in (dapp-kit, free personal-message signature), one real agent per wallet at `/app` (run/sync/sleep/commit jobs with live log, tell agent, decisions, memory + forget), read-only `/demo`. Demo agent re-run on **real Walrus Memory + Sui** (checkpoints 336,538,990–336,539,950), same 4/4 → 0/8 → 2/2 → 1/2 story. `Idea/` now committed.

## End of day 1 (21 Oct) — where things stand
- Run locally: `pnpm build` then `cd apps/server && npx tsx src/main.ts` → http://localhost:8787 (demo data in `demo/money-ops`, git-ignored).
- Tests: SDK 52 · CLI 4 · money-ops 5 · server 7 — all green.

## Next (day 2)
1. Sign in with a real wallet in the web app and run the agent end to end on real transactions; fix whatever breaks.
2. Polish app pages (Agent, Mind, Memory, History, Receipts) to the same premium black style as the homepage.
3. Deploy (server + web) so judges get a public URL.
4. Fix `SUI_MNEMONIC` (13 words), install Sui CLI, publish `engram_anchor`, set `ENGRAM_ANCHOR_PACKAGE`.
5. Stretch: paid `share` via MPP on Sui. Then docs, blog draft, demo video script.

## Day 2 (22 Oct)
- **Anchor contract on Testnet:** `engram_anchor` published, package `0xa1fccbb3e282e4ca09efbb2a46b3584d038fd154b9f9db36fc8d60d9051bf86b` (`packages/sdk/scripts/publish-anchor.ts`). `MoveAnchorer` works on testnet (public Sui gRPC) or mainnet (Tatum). Live: commit anchored, verify green, tampered root rejected.
- **Tatum moved to gRPC.** Sui switched JSON-RPC off (July 2026), and Tatum's JSON-RPC gateway now fails every call ("No healthy upstream"). `TatumSui` now uses `sui-mainnet-grpc.gateway.tatum.io` with a native gRPC transport (Tatum doesn't serve gRPC-Web). Wallet feed uses one `affectedAddress` query.
- **Walrus Memory outage** (relayer embedder 401, MemWal#1285): added manual-mode fallback — Gemini embeddings + Seal encryption with the owner key; recall merges both paths. Live commit → Walrus → anchor → verify all green.
- **Web e2e** (`apps/server/scripts/e2e.ts`): real wallet signature → tell → run (sync, learn, commit) → verify HEAD — passes. Run no longer aborts when the wallet sync fails.
- **Deploy prep:** `Dockerfile` (tested locally: homepage, stats, demo verify). Explorer links follow the anchor's network.
- **Docs:** README (gRPC, fallback, Move anchoring), `docs/blog-post.md`, `docs/video-script.md`.
- Tests: SDK 54 · CLI 4 · money-ops 5 · server 7 — all green.

## Next (day 3)
1. Deploy: Railway (login expired — user runs `railway login`) or another Docker host; set env vars + a volume at `/data`.
2. Mainnet: fresh wallet (phrase never in chat) with ~$5 SUI → `publish-anchor.ts mainnet` → `ENGRAM_ANCHOR_NETWORK=mainnet`.
3. Re-run the money-ops replay on Mainnet for the final demo data (10+ real memories).
4. Stretch: paid `share` via MPP.

## Day 2, later (22 Oct) — "make it all real"
- **Per-user storage:** each wallet's agent can move to the owner's own Walrus Memory account (server builds `create_account` / `add_delegate_key`, wallet signs, server submits; switch only after the chain confirms). Old memories stay readable via `CombinedRemote`.
- **Real demo story:** `money-ops live` sends real SUI between five generated wallets; the agent reads the owner's wallet from chain. Testnet run: Month 1 alerted 3/3 → learned 3 beliefs; Months 2–3 quiet 6/6 with receipts; Month 4 learned rent rise + scam address. **Paused at the Month 4 commit: Walrus Memory relayer is fully failing (MemWal#1285)** — a background watcher resumes it when recall works again.
- **Hardening:** per-client rate limits, `/api/health` + in-app status banner, relayer 429/5xx retries, manual-mode recall only as fallback/verify.
- **Faster + mobile:** route code-splitting (1.32 MB → 680 kB initial JS); dashboard fits at 390 px.
- Tests: SDK 56 · CLI 4 · money-ops 6 · server 13.

## Needs the user
1. ~1.5 SUI on **Mainnet** (wallet you control, phrase never in chat): Mainnet anchor publish, Mainnet live story (~0.75 SUI), storage-setup test (~0.02 SUI).
2. Gemini keys from **different Google Cloud projects** (or billing) — free tier is ~20 requests/day/model.
3. Hosting: `railway login` (or another Docker host).

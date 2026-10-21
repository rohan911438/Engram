# Progress

Plan: `Idea/08-roadmap.md` (local only). Deadline **10 Nov 2026, 17:00 UTC**.
Each milestone: build → validate (tests + real run) → fix → commit & push.

| # | Milestone | Status |
|---|---|---|
| M1 | Monorepo + spikes (Walrus Memory, Tatum Sui RPC, anchoring) | ✅ done — see `docs/spike-findings.md` |
| M2 | SDK core: crypto, Merkle, key vault, local store, episodes → Walrus | ✅ done — 19 tests; live push verified on Sui via Tatum |
| M3 | Consolidator ("sleep") with Gemini + versioned beliefs | ✅ done — 29 tests; live Gemini run revises rent/salary correctly |
| M4 | Commit engine: Merkle root, Ed25519 signature, manifest on Walrus, anchor lookup via Tatum | ⏳ in progress |
| M5 | Receipts, `verify`, `forget` (tombstones) | ⬜ |
| M6 | CLI: init, status, observe, sleep, commit, log, diff, checkout, blame, verify, forget | ⬜ |
| M7 | Money-ops example agent (Tatum wallet feed) | ⬜ |
| M8 | Inspector UI (built on open-source components) | ⬜ |
| M9 | `bisect`; paid `share` via MPP (stretch) | ⬜ |
| M10 | Mainnet demo data, docs, blog draft, video script | ⬜ |

## Log
- **21 Oct** — M1: Walrus Memory write/recall works (blob IDs returned, ~27 s/write). Each memory = Sui `Blob` object readable via Tatum. Tatum has no Sui Testnet.
- **21 Oct** — M2: SDK core. Episodes encrypted per-key (AES-256-GCM), pushed in bulk to Walrus Memory (~36 s for 2), blob IDs confirmed as Sui `Blob` objects via Tatum.
- **21 Oct** — M3: `sleep()` with Gemini (`gemini-flash-latest`, key rotation). Live: 8 wallet episodes → 3 beliefs (rent, payroll, swaps); after rent/raise news → 2 revisions + 1 anomaly belief, 0 rejected ops. Ungrounded LLM output (fake evidence, unknown beliefs) is rejected.

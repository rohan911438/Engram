# Progress

Plan: `Idea/08-roadmap.md` (local only). Deadline **10 Nov 2026, 17:00 UTC**.
Each milestone: build → validate (tests + real run) → fix → commit & push.

| # | Milestone | Status |
|---|---|---|
| M1 | Monorepo + spikes (Walrus Memory, Tatum Sui RPC, anchoring) | ✅ done — see `docs/spike-findings.md` |
| M2 | SDK core: crypto, Merkle, key vault, local store, episodes → Walrus | ⏳ in progress |
| M3 | Consolidator ("sleep") with Gemini + versioned beliefs | ⬜ |
| M4 | Commit engine: Merkle root, Ed25519 signature, manifest on Walrus, anchor lookup via Tatum | ⬜ |
| M5 | Receipts, `verify`, `forget` (tombstones) | ⬜ |
| M6 | CLI: init, status, observe, sleep, commit, log, diff, checkout, blame, verify, forget | ⬜ |
| M7 | Money-ops example agent (Tatum wallet feed) | ⬜ |
| M8 | Inspector UI (built on open-source components) | ⬜ |
| M9 | `bisect`; paid `share` via MPP (stretch) | ⬜ |
| M10 | Mainnet demo data, docs, blog draft, video script | ⬜ |

## Log
- **21 Oct** — M1: Walrus Memory write/recall works (blob IDs returned, ~27 s/write). Each memory = Sui `Blob` object readable via Tatum. Tatum has no Sui Testnet.

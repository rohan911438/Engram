# Engram

**Git for agent memory.** Engram gives AI agents memory that *learns*, has *history*, can be
*proven*, and can be *forgotten* — built on [Walrus Memory](https://docs.wal.app/walrus-memory/getting-started/what-is-walrus-memory.md),
with every snapshot anchored on Sui and verified through [Tatum](https://tatum.io)'s Sui RPC.

> Built for the Tatum × Walrus **Total Recall** hackathon (Track 02 — Smart Agents).

```
$ engram blame b_monthly_rent
b_monthly_rent@3  0.97  The user pays 500 USDC for rent to 0x7a11d10d…0000 on the 1st of every month.
  why: The user confirmed their rent increased to 500 USDC starting October.
  ← ep_7a76e402d4fd  2026-07-01  tatum: sent 450 USDC to 0x7a11d10d…
  ← ep_5b76245ee504  2026-07-26  user: "The 450 USDC to 0x7a11… is my rent, paid on the 1st…"
  ← ep_8e7d09586449  2026-10-01  user: "Yes, my rent went up to 500 USDC from October."
      blob kgx4O2JNHzVSrt3Jy4b5cPvTvLw_PrxkNqL4-NvYB7o

$ engram verify r_787dace2681385b7
  ✔ receipt signature      "ALERT[critical]: sent 250 USDC to 0x9bad00…" signed by the agent
  ✔ belief proofs          1 belief(s) proven to be in commit 31f306ab
  ✔ commit merkle root     5 beliefs + 0 tombstones → root 247af2230b10…
  ✔ commit walrus          manifest recalled from Walrus Memory
  ✔ commit sui anchor      Walrus Blob 0x8c61ff…2009 certified, tx 7RphhZRs… in checkpoint 336516038
VALID — this memory is exactly what was committed, signed and anchored.
```

## Why

Agents now remember things, but their memory is a black box that only grows:

| Problem | Engram's answer |
|---|---|
| Memories pile up as loose text; nothing turns them into knowledge | **`sleep`** consolidates raw *episodes* into versioned *beliefs* with confidence, evidence and a reason — and revises them when new evidence contradicts them |
| Nobody can tell what the agent "knew" last week, or which memory caused a bad decision | **`log` · `diff` · `checkout` · `blame` · `bisect`** over the agent's mind |
| An agent moves money — there's no tamper-proof record of *why* | Every decision gets a **signed receipt** with Merkle proofs into a **commit anchored on Sui**; **`verify`** checks it end to end via Tatum |
| Walrus is permanent; privacy rules need forgetting | **`forget`** crypto-shreds one memory (its own key is destroyed) and records a tombstone in the next commit |

## The demo agent: money-ops

`examples/money-ops` watches a Sui wallet through Tatum, learns its owner's habits, and decides
whether to alert. Every decision is a signed receipt. Its behaviour visibly changes as it learns
([full transcript](docs/demo-replay.md)):

| Phase | What happens | Alerts |
|---|---|---|
| July | Knows nothing — asks about everything. Owner explains rent, salary, subscription, swaps | 4 / 4 |
| Aug–Sep | Same habits — stays quiet, citing the belief behind each decision | **0 / 8** |
| October | Rent rises to 500 → *warn*; 1 800 USDC to an unknown address at 3 a.m. → *critical*. Owner: "that was a scam" | 2 / 2 |
| November | New rent accepted silently; a payment to the scam address is caught from memory | 1 / 2 |

```bash
pnpm --filter @engram/money-ops replay              # Walrus Memory + Sui (needs .env)
pnpm --filter @engram/money-ops replay --offline    # in-memory storage, real LLM
pnpm --filter @engram/money-ops watch 0x<address>   # a real wallet, live via Tatum
```

## Quick start

```bash
pnpm install && pnpm build
cp .env.example .env            # Walrus Memory, Tatum, Gemini keys

alias engram="node $(pwd)/packages/cli/dist/main.js"
engram init my-agent
engram observe -s user "I pay 450 USDC rent to 0x7a11 on the 1st"
engram sleep                    # episodes → beliefs (LLM)
engram commit -m "first week"   # Merkle root → signed → Walrus → Sui anchor
engram log
engram ui                       # the inspector
```

### SDK

```ts
import { Engram, servicesFromEnv } from "@engram/sdk";

const s = servicesFromEnv();                       // Walrus Memory, Tatum, Gemini from .env
const mind = Engram.open({ remote: s.remote, anchorer: s.anchorer });

mind.observe({ source: "tatum", data: tx });       // encrypted episode
await mind.sleep({ llm: s.llm() });                // consolidate → beliefs
await mind.commit("weekly");                       // prove

// Wrap any decision: relevant committed beliefs in, signed receipt out.
const { result, receipt } = await mind.act({ query: "payment to 0x7a11", input: tx }, async (beliefs) => {
  const decision = await myAgent.decide(tx, beliefs);
  return { action: decision.summary, used: decision.beliefIds, result: decision };
});

await mind.verifyReceipt(receipt!.id);             // signature → proofs → Walrus → Sui
mind.beliefsAt("2026-10-01");                      // time travel
mind.forget("ep_…");                               // provable forgetting
```

## Commands

| Command | What it does |
|---|---|
| `engram init <agent>` | Creates `.engram/` — Ed25519 agent key, key vault, Walrus Memory namespaces; checks Tatum |
| `engram observe` | Records an episode, encrypted with its own AES-256-GCM key |
| `engram sleep` | Consolidation with the LLM: create / revise / retract beliefs, grounded in episode IDs |
| `engram commit -m` | Push to Walrus Memory → Merkle root → signed manifest on Walrus → Sui anchor via Tatum |
| `engram log` · `diff` · `checkout` | History, belief diffs, the memory at any commit or date |
| `engram blame <belief>` | The episodes (with Walrus blob IDs) and version history behind a belief |
| `engram bisect <good> <bad>` | Binary search for the commit that broke the agent (`--grep` or `--ask`) |
| `engram verify [r_…\|commit]` | Full proof check: signatures, Merkle proofs, hash chain, Walrus, Sui |
| `engram forget <episode>` | Destroys the episode's key, retracts what depended on it, tombstones the next commit |
| `engram ui` | The inspector — belief graph with time slider, history, receipts, live verification |

## How it works

```
 agent / wallet feed ──observe──▶ episodes (AES-256-GCM, one key each) ──push──▶ Walrus Memory
                                     │                                        engram-<agent>-episodes
                                   sleep (LLM, validated: no invented evidence)
                                     ▼
                                  beliefs (immutable versions + evidence + reason) ─▶ engram-<agent>-beliefs
                                     │
                                   commit ── Merkle root over belief leaves + tombstones
                                     │       Ed25519-signed manifest, hash-linked to parent
                                     ├──────▶ Walrus Memory (engram-<agent>-commits) ─▶ Sui Blob object
                                     │                                                      ▲
 decision ──act──▶ receipt (signed, Merkle proofs into HEAD) ─▶ engram-<agent>-receipts     │
                                                                                            │
 verify ── signature → proofs → root rebuild → parent chain → Walrus recall → Tatum Sui RPC ─┘
```

- **Leaves** commit to belief ID, version, statement hash, confidence, evidence root and tags;
  domain-separated hashing (leaf `0x00`, node `0x01`).
- **Anchoring:** every Walrus Memory write registers a Walrus `Blob` object on Sui owned by the
  account owner. Engram finds the manifest's Blob object and its certifying transaction through
  Tatum, and `verify` re-reads both (blob ID, certification, owner, checkpoint, time).
- **Consolidation safety:** LLM output is validated — evidence must be real episode IDs, edits must
  target existing beliefs; rejected proposals get one repair round with the reason.
- **Crypto-shredding:** episode keys are wrapped by a master key in `.engram/vault.json`;
  `forget` deletes the wrapped key.

More: [`docs/spike-findings.md`](docs/spike-findings.md) (what we measured on Walrus Memory and Tatum).

## Honest limits

- **Forgetting** makes an episode unreadable to everyone holding only the ciphertext. It can't
  un-read copies already decrypted, and the belief *summaries* that cited it stay in Walrus history
  (they're retracted, not erased).
- **Anchoring** (option A) proves *when* a manifest blob was certified on Sui and that the
  account owner holds it. The manifest bytes on Walrus are Seal-encrypted by Walrus Memory, so the
  content check goes through Walrus Memory recall. A dedicated Move module that emits the Merkle
  root publicly is the planned upgrade.
- Keys (`agent.key`, `master.key`) live in `.engram/` on disk — fine for a hackathon, KMS/Seal later.

## Repo layout

```
packages/sdk        @engram/sdk — core library (49+ tests)
packages/cli        engram CLI + local inspector server
apps/inspector      web inspector (React, shadcn/ui, React Flow)
examples/money-ops  wallet-watching agent (Tatum feed, replay story)
docs/               spike findings, demo transcript
```

## Built with

Walrus Memory (`@mysten-incubation/memwal`) · Tatum Sui RPC · Sui · Gemini · `@noble/hashes`,
`@noble/curves` · shadcn/ui · React Flow · Tailwind CSS.

MIT licensed.

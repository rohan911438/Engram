# Engram

**Git for agent memory.** Engram gives AI agents memory that *learns*, has *history*, can be
*proven*, and can be *forgotten* — built on [Walrus Memory](https://docs.wal.app/walrus-memory/getting-started/what-is-walrus-memory.md),
with every snapshot anchored on Sui and verified through [Tatum](https://tatum.io)'s Sui gRPC gateway.

> Built for the Tatum × Walrus **Total Recall** hackathon (Track 02 — Smart Agents).

**Live demo:** [engram-blond.vercel.app](https://engram-blond.vercel.app) · API: [engram-api-ohae.onrender.com](https://engram-api-ohae.onrender.com)

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

`examples/money-ops` watches a Sui wallet, learns its owner's habits, and decides whether each
movement deserves an alert. Every decision is a signed receipt.

**The demo story uses real transactions.** `money-ops live` creates five wallets (owner, employer,
landlord, streaming service, scammer) and sends real SUI between them: salary in, rent and a
subscription out, a rent rise, and a staged theft. The agent never sees the script. It reads
the owner's wallet from the chain like any other wallet (Tatum on Mainnet, the public Sui node on
Testnet, because Tatum has no Sui Testnet).

| Phase | What happens on chain | Agent |
|---|---|---|
| Month 1 | Salary in; rent and subscription out. The owner explains them | 3 / 3 alerted, then learns 3 beliefs |
| Months 2–3 | The same six transfers again | **0 / 6 alerted**; each receipt cites the belief it used |
| Month 4 | Rent rises; 0.18 SUI goes to an unknown address. The owner: "that's a scammer" | Revises rent, learns the scam address |
| Month 5 | New rent; another payment to the scammer | Quiet on rent, catches the scammer from memory |

```bash
pnpm --filter @engram/money-ops live --network testnet --fund-from-env   # real transfers on Testnet
pnpm --filter @engram/money-ops live --network mainnet                   # same on Mainnet (fund the employer first)
pnpm --filter @engram/money-ops watch 0x<address>                        # any real wallet, live via Tatum
pnpm --filter @engram/money-ops replay --offline                         # scripted version, no chain (for tests)
```

The theft is staged (the owner's own key signs it), but it is an ordinary on-chain transfer.
Amounts are small: the whole story moves about 0.75 SUI.

## Quick start

From npm:

```bash
npx @rohankumar4179/engram init my-agent        # CLI
npm i @rohankumar4179/engram-sdk                # SDK
```

From source:

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
import { engram } from "@rohankumar4179/engram-sdk";

const mind = engram({ agent: "money-ops" });       // Walrus Memory, Tatum, Gemini from .env

// Wrap your existing agent: relevant committed beliefs in, a signed receipt out.
const agent = mind.wrap(async (tx, beliefs) => myAgent.decide(tx, beliefs), {
  used: (decision) => decision.beliefIds,
});
const decision = await agent(tx);
agent.lastReceipt;                                 // r_… with Merkle proofs into HEAD

mind.observe({ source: "tatum", data: tx });       // encrypted episode
await mind.sleep();                                // consolidate → beliefs
await mind.commit("weekly");                       // prove
await mind.beliefs({ about: "rent" });             // query
mind.at("2026-10-01");                             // time travel
mind.forget("ep_…");                               // provable forgetting
await mind.verify(agent.lastReceipt!.id);          // signature → proofs → Walrus → Sui
```

### Link a CLI / SDK agent to the web app

```bash
$ engram link --server https://engram-blond.vercel.app
  Open https://engram-blond.vercel.app/link?code=K7QF-29XM
  and approve code K7QF-29XM with your Sui wallet.
✔ linked to wallet 0xfe2cfd89…7b46
✔ synced 2 commits and 0 receipts — verified by the server
```

From then on every `engram commit` (or `mind.commit()` in the SDK, after `mind.link({...})`) syncs
automatically, and the agent shows up under **Your agents** when you sign in with that wallet.
Only the audit bundle is uploaded — commits, beliefs and signed receipts, never raw episodes or keys —
and the server **re-verifies every sync** (signatures, Merkle roots, Sui anchors) before showing it.
A link token only accepts bundles signed by that agent's key, and history can only grow.
`engram sync` re-uploads; `engram unlink` forgets the link locally (remove it from the dashboard too).

### MCP (Claude Code, Cursor, Claude Desktop)

```json
{ "mcpServers": { "engram": { "command": "npx", "args": ["@rohankumar4179/engram", "mcp", "-C", "/path/to/project"] } } }
```

Tools: `engram_status`, `engram_remember`, `engram_beliefs` (by topic or at a past commit),
`engram_sleep`, `engram_commit`, `engram_log`, `engram_diff`, `engram_blame`, `engram_forget`,
`engram_verify`.

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
| `engram export --audit` · `engram audit <file>` | Audit bundle (commits, beliefs, receipts — no raw episodes) that anyone can verify without the repo, incl. Sui anchors |
| `engram link` · `sync` · `unlink` | Link the agent to your web dashboard with your Sui wallet; commits sync automatically and are verified by the server |
| `engram mcp` | MCP server: the commands above as tools for Claude Code, Cursor, Claude Desktop |

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
- **Public anchoring (Move):** with `ENGRAM_ANCHOR_PACKAGE` set, every commit also calls
  [`engram_anchor::anchor`](contracts/engram_anchor/sources/anchor.move), which emits an `Anchored`
  event carrying the commit ID, Merkle root and agent key in the clear. `verify` re-reads the event
  (mainnet through Tatum, testnet through the public Sui gRPC node) and compares all three.
  Publish your own copy with `npx tsx packages/sdk/scripts/publish-anchor.ts testnet|mainnet`
  (needs the `sui` CLI for the build and `SUI_MNEMONIC` with a little SUI). Testnet package:
  `0xa1fccbb3e282e4ca09efbb2a46b3584d038fd154b9f9db36fc8d60d9051bf86b`.
- **Tatum over gRPC:** Sui switched JSON-RPC off in July 2026, so every chain read (wallet feed,
  Walrus Blob objects, anchor events) and every mainnet anchor transaction goes through Tatum's
  Sui gRPC gateway (`sui-mainnet-grpc.gateway.tatum.io`) with native gRPC. The wallet feed uses one
  `affectedAddress` query, so it sees money sent *and* received.
- **Walrus Memory fallback:** if the relayer's server-side embedding fails (as it did on 22 Oct,
  [MemWal#1285](https://github.com/MystenLabs/MemWal/issues/1285)), Engram switches to Walrus Memory's
  manual mode: it embeds locally (Gemini, 1536 dims), Seal-encrypts with the account owner's key,
  and the relayer only stores ciphertext + vector. Recall merges both paths, so `verify` keeps working.
- **Consolidation safety:** LLM output is validated — evidence must be real episode IDs, edits must
  target existing beliefs; rejected proposals get one repair round with the reason.
- **Crypto-shredding:** episode keys are wrapped by a master key in `.engram/vault.json`;
  `forget` deletes the wrapped key.

More: [`docs/spike-findings.md`](docs/spike-findings.md) (what we measured on Walrus Memory and Tatum).

## Deploy

**Frontend (Vercel)** — set the `VITE_API_URL` if deploying to a custom domain; otherwise the
root `vercel.json` rewrites `/api/*` to the Render backend automatically.

```bash
vercel --prod   # from repo root
```

**Backend (Render, Docker)** — the `render.yaml` at the repo root configures the service.
Set these env vars in the Render dashboard (all marked `sync: false`):

| Var | What it is |
|---|---|
| `TATUM_API_KEY_MAINNET` | Tatum API key (Sui gRPC) |
| `MEMWAL_KEY` | Walrus Memory account owner Ed25519 private key |
| `MEMWAL_ACCOUNT_ID` | Walrus Memory account object ID |
| `SUI_MNEMONIC` | 12-word mnemonic for the signing wallet |
| `GEMINI_API_KEYS` | Comma-separated Gemini API keys |
| `ENGRAM_ANCHOR_PACKAGE` | Move package ID of `engram_anchor` |
| `ENGRAM_PUBLIC_URL` | Public URL of this Render deployment |

The `apps/server/demo-agent/` directory is baked into the Docker image and loaded
automatically as the read-only public demo.

## Honest limits

- **Forgetting** makes an episode unreadable to everyone holding only the ciphertext. It can't
  un-read copies already decrypted, and the belief *summaries* that cited it stay in Walrus history
  (they're retracted, not erased).
- **Anchoring** (option A) proves *when* a manifest blob was certified on Sui and that the
  account owner holds it. The manifest bytes on Walrus are Seal-encrypted by Walrus Memory, so the
  content check goes through Walrus Memory recall. The optional Move anchor (above) puts the Merkle
  root itself on chain, readable by anyone.
- Keys (`agent.key`, `master.key`) live in `.engram/` on disk — fine for a hackathon, KMS/Seal later.

## Repo layout

```
packages/sdk        @rohankumar4179/engram-sdk — core library (62+ tests)
packages/cli        @rohankumar4179/engram CLI + MCP server
apps/web            web inspector + hosted agent UI (React, shadcn/ui, React Flow)
apps/server         Express API server (auth, jobs, agent tenants, link flow)
examples/money-ops  wallet-watching agent (Tatum feed, replay story)
contracts/          engram_anchor Move package (Sui testnet + mainnet)
docs/               spike findings, blog post, video script
```

## Built with

Walrus Memory (`@mysten-incubation/memwal`) · Tatum Sui RPC · Sui · Gemini · `@noble/hashes`,
`@noble/curves` · shadcn/ui · React Flow · Tailwind CSS.

MIT licensed.

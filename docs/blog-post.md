# Git for agent memory: building Engram on Walrus Memory, Sui and Tatum

*Draft for the Total Recall hackathon submission. Fill in the [bracketed] parts after the Mainnet run.*

AI agents are starting to remember things. They remember our preferences, our habits and, more and
more, our money. But agent memory today is a black box that only grows. You can't see what an agent
believed last week. You can't tell which memory caused a bad decision. You can't prove a memory
wasn't edited afterwards, and you can't really delete something you regret telling it.

Developers solved all four of these problems for code decades ago, with version control. **Engram
brings the same ideas to agent memory.**

## What Engram does

Engram is an SDK, a CLI and a web app that sit on top of [Walrus Memory](https://docs.wal.app/walrus-memory/).

- **Episodes → beliefs.** Raw observations (a wallet transaction, something the owner said) are
  stored as *episodes*, each encrypted with its own key. A `sleep` step uses an LLM to turn them
  into *beliefs*: short statements with a confidence, the exact episodes that support them, and a
  reason. New evidence revises a belief instead of piling up next to it. LLM output that cites
  episodes that don't exist is rejected.
- **Commits.** `commit` takes a Merkle root over every active belief, signs a manifest with the
  agent's Ed25519 key, stores it on Walrus and anchors it on Sui. Commits are hash-linked like git.
- **History.** `log`, `diff`, `checkout`, `blame` and `bisect` work on the agent's mind.
  `blame` shows the episodes behind a belief. `bisect` finds the commit where the agent started
  believing something wrong.
- **Receipts.** Every decision the agent makes becomes a signed receipt that names the beliefs it
  used, with Merkle proofs into the commit it relied on.
- **Verify.** `verify` checks a receipt or a commit end to end: signature, proofs, Merkle root,
  hash chain, the manifest recalled from Walrus, and the anchor re-read from Sui through Tatum.
- **Forget.** `forget` destroys one episode's key (crypto-shredding), retracts or revises the
  beliefs that depended on it, and records a tombstone in the next commit. Old receipts still verify.

## How it uses Walrus and Tatum

**Walrus Memory** stores everything durable: episodes, belief versions, commit manifests and
receipts, each in its own namespace. Each write becomes a Walrus `Blob` object on Sui, certified
in a real transaction, which gives Engram a first, free anchor for every commit.

**Sui and our own Move module.** For a stronger proof, each commit also calls a tiny Move package,
`engram_anchor`, which emits an `Anchored` event with the commit ID, Merkle root and agent key in
the clear. Anyone can check a commit against the chain without trusting us or decrypting anything.

**Tatum** is how Engram reads Sui. The money-ops agent's wallet feed, the Walrus Blob lookups and
every `verify` call go through Tatum's Sui gateway. When Sui switched JSON-RPC off this year, we
moved everything to Tatum's gRPC endpoint. One `affectedAddress` query now returns every
transaction that touched a wallet, sent or received.

## The demo: an agent that learns your money habits, from real transactions

`money-ops` watches a Sui wallet and decides whether each movement deserves an alert. For the
demo we didn't script the agent's input. We created five wallets (owner, employer, landlord,
streaming service, scammer) and sent real SUI between them. The agent only sees the owner's
wallet, read from the chain through Tatum like any other wallet.

| Phase | On chain | Agent |
|---|---|---|
| Month 1 | Salary in, rent and subscription out; the owner explains | Alerts on all 3, then learns 3 beliefs |
| Months 2–3 | The same transfers twice more | **Quiet on all 6**, each receipt citing the belief it used |
| Month 4 | Rent rises; 0.18 SUI leaves to an unknown address; the owner says it's a scammer | Revises the rent belief, learns the scam address |
| Month 5 | New rent; another payment to the scammer | Quiet on the rent, catches the scammer from memory |

You can watch this happen in the web app's **Mind** view. A time slider replays the agent's
beliefs commit by commit, and new or revised beliefs glow as they appear.

## Things that broke, and what we did

- **Sui JSON-RPC went away.** Tatum's JSON-RPC gateway started answering "No healthy upstream" to
  every call. We rewrote the Tatum client on gRPC. Tatum serves native gRPC, not gRPC-Web, so it
  uses a native transport.
- **Walrus Memory's embedder went down** on 22 Oct ([MemWal#1285](https://github.com/MystenLabs/MemWal/issues/1285)).
  Rather than wait, Engram now falls back to Walrus Memory's manual mode. It embeds locally,
  Seal-encrypts with the owner's key, and the relayer only stores ciphertext. Reads merge both
  paths, so verification never noticed.
- **The relayer rate-limits each key** (60 requests a minute). Engram waits out 429s using the
  relayer's own `retry_after_seconds`.
- **LLM free tiers are small.** Decisions are batched, quota errors rotate keys and models, and a
  failed wallet sync no longer stops the agent learning from what it was told.

## Try it

- Live app: [URL]
- Code: https://github.com/rohan911438/Engram
- Testnet anchor package: `0xa1fccbb3e282e4ca09efbb2a46b3584d038fd154b9f9db36fc8d60d9051bf86b`
- Mainnet anchor package: [after the Mainnet publish]

## What's next

An MCP server so Claude Code, Cursor and other agents get `commit`, `blame` and `verify` as tools;
plug-ins for the Vercel AI SDK and LangChain; a Python SDK; and paid memory sharing between agents.

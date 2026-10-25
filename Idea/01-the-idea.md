# 01: The Idea

## The problem

AI agents are starting to act for us: watching wallets, paying bills, answering customers.
To do that well they need memory, and memory tools like Walrus Memory now make that easy.

Once an agent remembers, new questions come up:

1. **How did it learn?** Memories pile up as text. It's hard to see what the agent concluded,
   and how that changed when new facts arrived.
2. **Why did it do that?** When an agent makes a decision, there's rarely a record of *which*
   knowledge it relied on.
3. **Can I trust the record?** Logs live on the operator's server and can be edited later.
4. **Can it forget?** People can ask for their data to be removed, but good storage is built
   to be permanent.
5. **What went wrong?** When an agent starts misbehaving, finding the memory that caused it
   is guesswork.

## The idea: git for an agent's mind

Developers solved these questions for code long ago: version control. Every change is a
commit, history can be compared, and you can see who changed what.

**Engram brings the same model to agent memory, and adds proof.**

| Layer | What it does | Like… |
|---|---|---|
| **Learning** | Raw memories (episodes) are turned into beliefs with confidence and evidence. New facts revise old beliefs. | How we turn experiences into knowledge while we sleep |
| **History** | Each learning step is a commit. `log`, `diff`, `checkout`, `blame`, `bisect`. | Git |
| **Proof** | Commits are signed, stored on Walrus and anchored on Sui. Every decision gets a signed receipt anyone can verify. | A notary for the agent's mind |
| **Control** | Each memory has its own key. Destroy the key and the memory is gone for good, with a record in history. | A paper shredder that leaves a receipt |

## Built on Walrus Memory, not instead of it

Walrus Memory gives agents private, decentralised memory. Engram builds on top of it: it uses
Walrus Memory for storage and encryption, and adds beliefs, history and verification. Walrus
Memory's docs describe verifiable memory as a direction they're heading in, and Engram is one
working answer to it.

> **Walrus Memory gives agents memory. Engram gives that memory history, proof and control.**

## What we shipped

- **CLI** (`npx @rohankumar4179/engram`): every command, from `init` to `verify`.
- **TypeScript SDK**: wrap an existing agent in a few lines. Beliefs go in, signed receipts come out.
- **MCP server**: use Engram from Claude Code, Cursor or Claude Desktop.
- **Web app**: sign in with a Sui wallet, run a hosted agent, or link your own CLI/SDK agent
  and watch its memory on a dashboard. Includes docs and a public demo.
- **Move contract** (`engram_anchor`): puts each commit's Merkle root on Sui as a public event.
- **Example agent** (money-ops): watches a real Sui wallet through Tatum, learns its owner's
  habits, and flags unusual payments, such as a transfer to a known scam address.

## Where it's heading

The standard way to run **accountable** agents. Developers would use it to debug them, teams to
audit them, and users to trust them. See [08-built-and-next.md](08-built-and-next.md).

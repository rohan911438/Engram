# Engram: Git for Agent Memory

> **Every belief traceable. Every decision provable. Every memory forgettable.**

Engram gives AI agents a memory that **learns, keeps its history, and can prove what it knew**.
It is built on **Walrus Memory**, with proofs on **Sui** read through **Tatum**.

| | |
|---|---|
| 🌐 Live app | https://engram-blond.vercel.app |
| 📖 Docs | https://engram-blond.vercel.app/docs |
| 🔎 Live demo agent (no wallet needed) | https://engram-blond.vercel.app/demo |
| 📦 CLI | `npx @rohankumar4179/engram` ([npm](https://www.npmjs.com/package/@rohankumar4179/engram)) |
| 📦 SDK | `npm i @rohankumar4179/engram-sdk` ([npm](https://www.npmjs.com/package/@rohankumar4179/engram-sdk)) |
| 💻 Code | https://github.com/rohan911438/Engram |
| 🏁 Hackathon | Total Recall (Tatum × Walrus). Track 02: *Smart Agents for Real Life* |

---

## Engram in 60 seconds

**The problem.** Agents now remember things, but you can't easily see *how* their memory
changed, *why* they made a decision, or *prove* that nobody edited their memory afterwards.

**What Engram does.** It treats an agent's memory like code in git:

1. **observe**: the agent records what it sees. Each memory is encrypted with its own key and stored on Walrus.
2. **sleep**: an LLM turns new memories into **beliefs** ("rent is 520 USDC on the 1st"), and revises old ones when facts change.
3. **commit**: the beliefs are hashed into one fingerprint (a Merkle root), signed by the agent, saved on Walrus and anchored on Sui.
4. **decide**: every action gets a signed **receipt** that proves exactly which beliefs it used.
5. **verify**: anyone can check a receipt or commit end to end. Signature → Merkle proof → Walrus → Sui.

You can also `diff` two points in time, `checkout` what the agent believed last week, `blame` a
belief to see its evidence, `bisect` to find when it learned something wrong, and `forget` a
memory so it can never be read again, with proof.

**Why Walrus.** Memory you need to trust shouldn't live on one company's server. Walrus keeps
it decentralised and addressable, Walrus Memory keeps it private to the owner, and Sui gives it
a public timestamp. See [02-why-walrus.md](02-why-walrus.md).

---

## Try it in four commands

```bash
npx @rohankumar4179/engram observe "Got a raise, salary is now 4200 USDC"
npx @rohankumar4179/engram sleep          # memory → belief (revises the old salary)
npx @rohankumar4179/engram commit -m "raise"   # signed → Walrus → Sui → dashboard
npx @rohankumar4179/engram verify         # ✔ signature ✔ Merkle ✔ Walrus ✔ Sui → VALID
```

A fresh agent starts with `init <name>`. To see it on the dashboard, link it with
`link --server https://engram-blond.vercel.app`. Full guide: [04-try-it.md](04-try-it.md).

---

## Guide for judges

| If you want to see… | Go to |
|---|---|
| The idea and who it helps | [01-the-idea.md](01-the-idea.md) · [06-who-its-for.md](06-who-its-for.md) |
| How Walrus, Sui and Tatum are used | [02-why-walrus.md](02-why-walrus.md) |
| The system design | [03-how-it-works.md](03-how-it-works.md) |
| How to run it yourself | [04-try-it.md](04-try-it.md) |
| The cryptography, and its honest limits | [05-proof-and-privacy.md](05-proof-and-privacy.md) |
| How we meet each judging criterion | [07-judging-criteria.md](07-judging-criteria.md) |
| What is built today, and what's next | [08-built-and-next.md](08-built-and-next.md) |
| Links | [09-references.md](09-references.md) |

**Fastest look:** open the [live demo agent](https://engram-blond.vercel.app/demo). It's a
wallet-watching agent that ran on real transactions. Open **Receipts**, then **Verify** any
receipt to watch every check run live.

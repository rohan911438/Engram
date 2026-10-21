# 06 — Who Should Use Engram

## Primary users

| Who | Their pain today | What Engram gives them | Key commands |
|---|---|---|---|
| **AI agent developers** (indie + startups) | "My agent got worse and I don't know why." Memory is a black box. | See what it learned, find the bad memory, roll back | `log`, `diff`, `blame`, `bisect`, `checkout` |
| **Fintech / on-chain agent builders** (trading bots, treasury agents, payment agents) | Agents move money; users and partners ask *why* a transaction happened | Signed receipts proving which memory drove each action | `commit`, `verify` |
| **Teams in regulated industries** (finance, health, insurance, legal, HR) | Regulators increasingly require records explaining automated decisions | Tamper-proof, verifiable decision trail; audit exports | `verify`, `export --audit` |
| **Privacy-sensitive apps** | Users can ask for their data to be deleted, but the storage is permanent | Provable forgetting with tombstones in history | `forget` |
| **Multi-agent systems** | Agent B must start from what Agent A learned, but only part of it | Scoped, expiring, auditable sharing | `share` |
| **QA / eval teams** | Can't reproduce agent behaviour from last week | Replay with the exact past memory | `checkout`, `bisect` |

## Secondary users

- **Personal AI power users** (via MCP in Claude Code / Cursor): "What have you learned about
  me? Forget that. Why do you think this?"
- **DAOs / on-chain organisations** running agents: public proof that the agent acted on
  approved knowledge.
- **Auditors and security reviewers**: verify a receipt without trusting the operator.

## Example use cases

1. **Money-ops agent** (our hackathon demo): watches a Sui wallet via Tatum, learns habits
   (rent, subscriptions, usual amounts), flags unusual activity, explains every flag with
   `blame`, proves it with `verify`.
2. **Support bot regression:** after an update the bot gives wrong refunds → `bisect` finds the
   belief "refunds allowed up to 60 days" learned from one misread ticket → `forget` + re-commit.
3. **Trading agent dispute:** a user claims the bot traded without reason → operator shares the
   receipt → user runs `engram verify` themselves.
4. **Health assistant:** patient asks to delete a conversation → `forget` → tombstone proves it.
5. **Agent hand-off:** research agent shares only `scope: sources` beliefs with a writing agent
   for 7 days.

## Who it's NOT for

- Simple chatbots that don't need history, audit or debugging — plain Walrus Memory is enough.
- Apps that need memory to be fully editable/mutable in place (Engram is append-only by design).
- Real-time systems where adding a commit step to every action is too slow (commits can be
  batched, but there is a cost).

## Positioning in one line

**Walrus Memory gives agents memory. Engram gives that memory history, proof and control.**

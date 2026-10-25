# 06: Who It's For

## Main users

| Who | Their question | How Engram helps |
|---|---|---|
| **Agent developers** | "My agent got worse. What did it learn?" | `log`, `diff`, `blame`, `bisect`, `checkout` |
| **On-chain and fintech agents** (wallet watchers, treasury, payments) | "Why did the agent move or block this money?" | Signed receipts that anyone can `verify` |
| **Regulated teams** (finance, health, insurance, HR) | "Can we show which knowledge an AI decision used?" | Tamper-evident history and audit bundles |
| **Privacy-first apps** | "The user asked us to delete their data. Can we prove it?" | `forget` with tombstones in history |
| **AI assistant users** (via MCP) | "What do you know about me? Forget that." | Engram tools inside Claude Code, Cursor, Claude Desktop |

## Example stories

1. **Money-ops agent (our demo).** Watches a Sui wallet through Tatum. It learns rent, salary and
   regular swaps, stops alerting on normal payments, and flags a payment to a known scam address
   as CRITICAL. That receipt verifies end to end on Walrus and Sui.
2. **Support bot regression.** After an update the bot approves wrong refunds. `bisect` finds the
   commit where it learned *"refunds allowed up to 60 days"* from one misread ticket. `forget`
   removes the bad memory, and the next commit fixes it.
3. **Trading dispute.** A user says the bot traded for no reason. The operator shares the
   receipt, and the user runs `verify` themselves.
4. **Right to be forgotten.** A patient asks an assistant to delete a conversation. After
   `forget`, the history shows it was removed.

## When you don't need Engram

- A simple chatbot with no need for history, audit or debugging. Plain Walrus Memory is enough.
- Data that must be edited in place. Engram is append-only by design.

## In one line

**Walrus Memory gives agents memory. Engram gives that memory history, proof and control.**

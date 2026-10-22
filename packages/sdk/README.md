# @rohankumar4179/engram-sdk

Git for agent memory: episodes → beliefs (LLM), signed commits on Walrus Memory anchored on Sui,
decision receipts with Merkle proofs, `verify`, and provable `forget`.

```ts
import { engram } from "@rohankumar4179/engram-sdk";

const mind = engram({ agent: "money-ops" });          // keys from .env (Walrus Memory, Tatum, Gemini)
const agent = mind.wrap(myAgent, { used: (out) => out.beliefIds });

mind.observe({ source: "tatum", data: tx });          // encrypted episode
await mind.sleep();                                   // episodes → beliefs
await mind.commit("weekly");                          // Merkle root → Walrus → Sui
await mind.beliefs({ about: "rent" });
mind.at("2026-10-25");                                // time travel
mind.forget("ep_…");                                  // provable forgetting
await mind.verify(agent.lastReceipt!.id);             // proof check
```

Audit bundles: `exportAudit(mind.core)` / `verifyAudit(bundle, { anchorer })`.
Full docs: https://github.com/rohan911438/Engram

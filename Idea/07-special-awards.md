# 07 — Special Awards: Which Ones Can We Add?

Three special awards, $500 each, "on top" of track prizes.

> ⚠️ **Open question:** the page doesn't say explicitly whether one project can win more than
> one award. **Ask in the Tatum Discord before we spend time on a second special.**

## Summary

| Award | Fit | Extra work | Decision |
|---|---|---|---|
| **Best Walrus Memory** | ⭐⭐⭐ Perfect — the whole product is about memory that visibly changes the agent | None (it's the core) | **Primary target** |
| **Best Use of Agent Payments** (x402 / MPP on Sui) | ⭐⭐ Good — paid `share` is a natural feature and part of the long-term plan | ~2–3 days | **Stretch — only after must-haves are done** |
| **Best Tatum AI Builder App** | ⭐ Weak — must be "built *primarily* with ai.tatum.io"; our core is an SDK/CLI | Low to try, low chance | **Skip** (optional: generate the inspector shell there) |

## 1. Best Walrus Memory — primary

Criteria: *"Deepest learning loop. Memories that visibly change the product."*

How we hit it hard:
- Episodes → beliefs → revised beliefs: a real learning loop, not just storage.
- Inspector shows the belief graph changing over time with a slider.
- The money-ops agent's behaviour visibly changes: week 1 it asks about everything, week 3 it
  only flags real anomalies — and each change is traceable to specific memories (`blame`).
- Uses Walrus features deeply: namespaces, blob IDs, manifests as blobs, Sui objects.
- Fills gaps Walrus itself lists as roadmap (`verify()`).

## 2. Best Use of Agent Payments — stretch

Criteria: *"Best app across tracks using x402 or MPP, settled on Sui."*

**Is it possible on Sui?** Yes, it appears so:
- **MPP** (Machine Payments Protocol, by Stripe and Tempo Labs) has a Sui package:
  **`@suimpp/mpp`** (formerly `@mppsui/mpp` / `@t2000/mpp-sui`), adding Sui USDC as a payment
  method via the `mppx` SDK. Server checks the payment on-chain before responding.
- **x402** on Sui: third-party facilitators exist (e.g. BlockEden claims Sui support) —
  less certain than MPP.

**How it fits Engram (not bolted on):**
- `engram share --to <agent> --scope sources --expires 7d --price 0.05`
- The receiving agent calls the share endpoint → gets **HTTP 402** → pays 0.05 USDC on Sui via
  MPP → server verifies payment (can double-check via Tatum Sui RPC) → releases the wrapped keys.
- Story: *"Agents can now sell what they've learned — with proof of what they sold."*
- This is also the first step of the memory-marketplace roadmap.

**Cost:** a few cents of USDC + SUI gas on Mainnet for the demo.
**Risk:** package maturity (v0.x). Spike it for half a day in week 1; drop if it fights us.

## 3. Best Tatum AI Builder App — skip

- Requires the product to be built *primarily* with ai.tatum.io. Engram's core (SDK, CLI,
  crypto) can't credibly be "primarily" AI-Builder-built.
- We could generate the inspector UI or the money-ops dashboard shell in AI Builder, but judges
  would likely see the core wasn't built there.
- Recommendation: don't spend time on it. If the user wants, try generating the inspector shell
  there in week 1 as a free experiment.

## Prize scenarios

| Scenario | Prizes |
|---|---|
| Floor | Track 02 3rd = **$200** |
| Realistic | Track 02 2nd/1st + Best Walrus Memory = **$800 – $1,000** |
| Best case | Track 02 1st + Best Walrus Memory + Agent Payments = **$1,500** (if stacking is allowed) |

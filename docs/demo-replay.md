# Money-ops replay — sample run

Output of `pnpm --filter @engram/example-money-ops replay --offline` (real Gemini decisions, in-memory storage), 21 Oct 2026. Full addresses shortened by the agent.

```
2026-07-01 sent 450 USDC to 0x7a11d1…           🔔 INFO I noticed an outgoing transfer of 450 USDC, but I am still learning your habits as there are no established patterns yet.
2026-07-03 sent 100 USDC (swap)                 🔔 INFO I noticed a swap of 100 USDC and am alerting you since I am still learning your habits.
2026-07-10 sent 12 USDC to 0x5f1e70…            🔔 INFO I noticed an outgoing transfer of 12 USDC to a new address, and I am alerting you while I am still learning your habits.
2026-07-25 received 2100 USDC from 0xacc0e9…    🔔 INFO Received 2,100 USDC from an unknown sender; alerting since I am still learning your habits.
2026-07-26 💬 owner: The 450 USDC to 0x7a11d10d… is my rent, paid on the 1st. The 2100 from 0xacc0e9a1… is my salary. The 12 USDC on the 10th is my streaming subscription. I swap about 100 USDC into SUI every month.

💤 sleep — 5 episodes → 4 new, 0 revised, 0 retracted beliefs
   + b_monthly_rent (0.95) The user pays 450 USDC for rent to 0x7a11d10d00000000000000000000000000000000000000000000000000000000 on the 1st of every month.
   + b_monthly_salary (0.95) The user receives a salary of 2100 USDC from 0xacc0e9a10000000000000000000000000000000000000000000000000000000.
   + b_streaming_subscription (0.95) The user pays a 12 USDC streaming subscription to 0x5f1e700000000000000000000000000000000000000000000000000000000000 around the 10th of the month.
   + b_monthly_swap (0.95) The user swaps about 100 USDC into SUI every month.
📌 commit 6f7ec7eb "July: first month of wallet activity" — 4 beliefs · anchored on Sui, checkpoint 1

2026-08-01 sent 450 USDC to 0x7a11d1…           ✓ quiet Monthly rent payment of 450 USDC sent as expected on the 1st.
           receipt r_c5b6789d79601436 · beliefs [b_monthly_rent@1] · commit 6f7ec7eb
2026-08-04 sent 100 USDC (swap)                 ✓ quiet Your monthly swap of about 100 USDC into SUI just occurred as expected per your usual habits.
           receipt r_e16daa8c6ca3c085 · beliefs [b_monthly_swap@1] · commit 6f7ec7eb
2026-08-10 sent 12 USDC to 0x5f1e70…            ✓ quiet This matches your usual monthly streaming subscription payment.
           receipt r_23bad3d6da8b2448 · beliefs [b_streaming_subscription@1] · commit 6f7ec7eb
2026-08-25 received 2100 USDC from 0xacc0e9…    ✓ quiet Received expected monthly salary from the usual employer according to your b_monthly_salary belief.
           receipt r_3a746cdbeeea10ca · beliefs [b_monthly_salary@1] · commit 6f7ec7eb
2026-09-01 sent 450 USDC to 0x7a11d1…           ✓ quiet Rent payment of 450 USDC to your usual landlord address, as expected by your monthly rent schedule.
           receipt r_4f0510f86daad6f0 · beliefs [b_monthly_rent@1] · commit 6f7ec7eb
2026-09-04 sent 100 USDC (swap)                 ✓ quiet This outgoing swap of 100 USDC matches your monthly swap habit.
           receipt r_62d60d145f3972a5 · beliefs [b_monthly_swap@1] · commit 6f7ec7eb
2026-09-10 sent 12 USDC to 0x5f1e70…            ✓ quiet This matches your expected monthly streaming subscription.
           receipt r_23ce363fa077fa2b · beliefs [b_streaming_subscription@1] · commit 6f7ec7eb
2026-09-25 received 2100 USDC from 0xacc0e9…    ✓ quiet Received your expected monthly salary matching your usual amount.
           receipt r_2a4b3d9df243e882 · beliefs [b_monthly_salary@1] · commit 6f7ec7eb

💤 sleep — 8 episodes → 0 new, 4 revised, 0 retracted beliefs
   ~ b_monthly_rent@2 (0.97) The user pays 450 USDC for rent to 0x7a11d10d00000000000000000000000000000000000000000000000000000000 on the 1st of every month.
   ~ b_monthly_salary@2 (0.97) The user receives a salary of 2100 USDC from 0xacc0e9a100000000000000000000000000000000000000000000000000000000.
   ~ b_streaming_subscription@2 (0.97) The user pays a 12 USDC streaming subscription to 0x5f1e700000000000000000000000000000000000000000000000000000000000 around the 10th of the month.
   ~ b_monthly_swap@2 (0.97) The user swaps about 100 USDC into SUI every month.
📌 commit 63904eb4 "Aug–Sep: habits confirmed" — 4 beliefs · anchored on Sui, checkpoint 2

2026-10-01 sent 500 USDC to 0x7a11d1…           🔔 WARN You sent 500 USDC to your landlord, which is higher than your usual 450 USDC rent payment.
           receipt r_6484a91bd3e81cbd · beliefs [b_monthly_rent@2] · commit 63904eb4
2026-10-01 💬 owner: Yes, my rent went up to 500 USDC from October.
2026-10-02 sent 1800 USDC to 0x9bad00…          🔔 CRITICAL You made a large outgoing transfer of 1800 USDC to an unknown address that does not match your regular habits.
           receipt r_98078a01aa34c3b6 · beliefs [none] · commit 63904eb4
2026-10-02 💬 owner: I did NOT send 1800 USDC to 0x9bad0000… — that address is a scammer. Always treat it as theft.

💤 sleep — 4 episodes → 1 new, 1 revised, 0 retracted beliefs
   + b_scam_address_flag (0.97) Address 0x9bad000000000000000000000000000000000000000000000000000000000000 is a scammer and any transfers to it represent theft.
   ~ b_monthly_rent@3 (0.97) The user pays 500 USDC for rent to 0x7a11d10d00000000000000000000000000000000000000000000000000000000 on the 1st of every month.
📌 commit 31f306ab "October: rent change + scam address" — 5 beliefs · anchored on Sui, checkpoint 3

2026-11-01 sent 500 USDC to 0x7a11d1…           ✓ quiet Your monthly rent of 500 USDC matches your usual payment schedule.
           receipt r_15b8366b6eeefa8a · beliefs [b_monthly_rent@3] · commit 31f306ab
2026-11-03 sent 250 USDC to 0x9bad00…           🔔 CRITICAL An outgoing transfer of 250 USDC was sent to a known scam address, which contradicts our safety beliefs.
           receipt r_787dace2681385b7 · beliefs [b_scam_address_flag@1] · commit 31f306ab

How the agent changed
  July: first month of wallet activity       4/4 events alerted
  Aug–Sep: habits confirmed                  0/8 events alerted
  October: rent change + scam address        2/2 events alerted
  November: applying what it learned         1/2 events alerted
```

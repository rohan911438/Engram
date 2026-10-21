import type { WalletEvent } from "./feed.js";

/**
 * A four-month wallet story used by `replay`, so the learning loop can be
 * shown in minutes. Addresses are made up; the shape matches what WalletFeed
 * produces from real Tatum data.
 */
const addr = (seed: string) => `0x${seed.padEnd(64, "0")}`;
export const OWNER = addr("0wner");
export const LANDLORD = addr("7a11d10d");
export const EMPLOYER = addr("acc0e9a1");
export const STREAMING = addr("5f1e7");
export const STRANGER = addr("9bad");

export type Step =
  | { type: "tx"; event: WalletEvent }
  | { type: "owner"; ts: number; message: string }
  | { type: "sleep"; label: string };

let n = 0;
const tx = (iso: string, direction: "in" | "out", amount: number, coin: string, counterparty: string | null, kind: WalletEvent["kind"] = "transfer"): Step => ({
  type: "tx",
  event: { digest: `demo${String(++n).padStart(4, "0")}`, ts: Date.parse(iso), direction, coin, amount, counterparty, kind },
});
const owner = (iso: string, message: string): Step => ({ type: "owner", ts: Date.parse(iso), message });
const sleep = (label: string): Step => ({ type: "sleep", label });

export const SCENARIO: Step[] = [
  // July — the agent knows nothing and asks about everything.
  tx("2026-07-01T09:02:00Z", "out", 450, "USDC", LANDLORD),
  tx("2026-07-03T21:40:00Z", "out", 100, "USDC", null, "swap"),
  tx("2026-07-10T07:15:00Z", "out", 12, "USDC", STREAMING),
  tx("2026-07-25T08:00:00Z", "in", 2100, "USDC", EMPLOYER),
  owner("2026-07-26T10:00:00Z", `The 450 USDC to ${LANDLORD.slice(0, 10)}… is my rent, paid on the 1st. The 2100 from ${EMPLOYER.slice(0, 10)}… is my salary. The 12 USDC on the 10th is my streaming subscription. I swap about 100 USDC into SUI every month.`),
  sleep("July: first month of wallet activity"),

  // August + September — habits repeat; the agent should go quiet.
  tx("2026-08-01T09:10:00Z", "out", 450, "USDC", LANDLORD),
  tx("2026-08-04T22:05:00Z", "out", 100, "USDC", null, "swap"),
  tx("2026-08-10T07:12:00Z", "out", 12, "USDC", STREAMING),
  tx("2026-08-25T08:01:00Z", "in", 2100, "USDC", EMPLOYER),
  tx("2026-09-01T09:05:00Z", "out", 450, "USDC", LANDLORD),
  tx("2026-09-04T21:55:00Z", "out", 100, "USDC", null, "swap"),
  tx("2026-09-10T07:18:00Z", "out", 12, "USDC", STREAMING),
  tx("2026-09-25T08:00:00Z", "in", 2100, "USDC", EMPLOYER),
  sleep("Aug–Sep: habits confirmed"),

  // October — things change. One change is fine, one is theft.
  tx("2026-10-01T09:03:00Z", "out", 500, "USDC", LANDLORD),
  owner("2026-10-01T12:00:00Z", "Yes, my rent went up to 500 USDC from October."),
  tx("2026-10-02T03:12:00Z", "out", 1800, "USDC", STRANGER),
  owner("2026-10-02T07:30:00Z", `I did NOT send 1800 USDC to ${STRANGER.slice(0, 10)}… — that address is a scammer. Always treat it as theft.`),
  sleep("October: rent change + scam address"),

  // November — the agent applies what it learned.
  tx("2026-11-01T09:01:00Z", "out", 500, "USDC", LANDLORD),
  tx("2026-11-03T02:47:00Z", "out", 250, "USDC", STRANGER),
];

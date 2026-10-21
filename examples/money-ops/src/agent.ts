import type { Belief, Engram, LLM, Receipt } from "@engram/sdk";
import { describe, type WalletEvent } from "./feed.js";

export interface Assessment {
  alert: boolean;
  severity: "info" | "warn" | "critical";
  message: string;
  /** Belief IDs the decision relied on. */
  used: string[];
}

export interface Handled {
  event: WalletEvent;
  assessment: Assessment;
  receipt: Receipt | null;
  beliefs: Belief[];
}

export const CONTEXT =
  "You are a money-ops agent watching one owner's Sui wallet. Learn their financial habits (rent, salary, subscriptions, regular swaps, known counterparties) so you can stay quiet about normal activity and flag real anomalies.";

const SYSTEM = `You are a money-ops agent watching one person's crypto wallet. For each new wallet event, decide whether to alert the owner.

You get the agent's BELIEFS about the owner (learned from past activity and from what the owner said) and a list of EVENTS.

- If a belief clearly explains an event (same counterparty, similar amount, expected timing), do NOT alert; cite that belief.
- Alert if nothing explains it, or it contradicts a belief (different amount, unknown counterparty, odd time, unusually large).
- If there are no relevant beliefs yet, alert with severity "info" and say you are still learning the owner's habits.
- severity: "info" (new/unknown but harmless-looking), "warn" (deviation from a known pattern), "critical" (large outgoing to an unknown address, or anything that looks like theft).
- message: one short sentence to the owner. Mention the belief that made you decide, in plain words.
- used: the ids of beliefs you relied on (empty if none). Only use ids from the list.
- Judge each event on its own; return exactly one decision per event, with its digest.`;

const SCHEMA = {
  type: "object",
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          digest: { type: "string" },
          alert: { type: "boolean" },
          severity: { type: "string", enum: ["info", "warn", "critical"] },
          message: { type: "string" },
          used: { type: "array", items: { type: "string" } },
        },
        required: ["digest", "alert", "severity", "message", "used"],
      },
    },
  },
  required: ["decisions"],
};

/**
 * The agent. Every wallet event becomes an encrypted episode; every decision
 * goes through `engram.act`, so it gets a signed receipt pointing at the exact
 * committed beliefs it used. Events are judged in batches — one LLM call per
 * batch — to stay inside free-tier LLM quotas.
 */
export class MoneyOpsAgent {
  constructor(
    readonly engram: Engram,
    private llm: LLM,
  ) {}

  async handle(event: WalletEvent): Promise<Handled> {
    return (await this.handleMany([event]))[0]!;
  }

  async handleMany(events: WalletEvent[]): Promise<Handled[]> {
    if (events.length === 0) return [];
    for (const event of events) {
      this.engram.observe({ source: "tatum", ts: event.ts, summary: describe(event), data: { ...event, date: new Date(event.ts).toISOString() } });
    }
    const head = this.engram.head();
    const beliefs = head ? this.engram.beliefsAt(head) : [];
    const judged = events.filter((e) => e.kind !== "gas_only");
    const decisions = judged.length ? await this.assess(judged, beliefs) : new Map<string, Assessment>();

    const out: Handled[] = [];
    for (const event of events) {
      const assessment = event.kind === "gas_only" ? quietGas() : (decisions.get(event.digest) ?? fallback());
      const action = `${assessment.alert ? `ALERT[${assessment.severity}]` : "no alert"}: ${describe(event)} — ${assessment.message}`;
      const res = await this.engram.act({ query: describe(event), input: event, limit: 50 }, () => ({ action, used: assessment.used, result: assessment }));
      out.push({ event, assessment, receipt: res.receipt, beliefs: res.beliefs });
    }
    return out;
  }

  /** The owner talks back — corrections and confirmations are the strongest evidence. */
  ownerSays(message: string, ts = Date.now()) {
    return this.engram.observe({ source: "user", ts, summary: "owner message", data: { message } });
  }

  private async assess(events: WalletEvent[], beliefs: Belief[]): Promise<Map<string, Assessment>> {
    const list = beliefs.length ? beliefs.map((b) => `- id=${b.id} conf=${b.confidence.toFixed(2)}: ${b.statement}`).join("\n") : "(none yet)";
    const evs = events.map((e) => ({ ...e, date: new Date(e.ts).toISOString(), weekday: new Date(e.ts).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) }));
    const r = await this.llm.json<{ decisions?: (Assessment & { digest: string })[] }>(SYSTEM, `BELIEFS:\n${list}\n\nEVENTS:\n${evs.map((e) => JSON.stringify(e)).join("\n")}`, SCHEMA);
    const known = new Set(beliefs.map((b) => b.id));
    return new Map(
      (r.decisions ?? []).map((d) => [d.digest, { alert: !!d.alert, severity: d.severity ?? "info", message: d.message ?? "", used: (d.used ?? []).filter((u) => known.has(u.split("@")[0]!)) }]),
    );
  }
}

function quietGas(): Assessment {
  return { alert: false, severity: "info", message: "Gas fee only.", used: [] };
}

/** If the model skipped an event, be safe and tell the owner. */
function fallback(): Assessment {
  return { alert: true, severity: "info", message: "I couldn't assess this one automatically — please take a look.", used: [] };
}

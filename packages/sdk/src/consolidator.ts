import type { LLM, Schema } from "./llm.js";
import type { Belief, EpisodeContent } from "./types.js";

/** One change the consolidator wants to make to the belief set. */
export type BeliefOp =
  | { op: "create"; key: string; statement: string; confidence: number; evidence: string[]; tags: string[]; reason: string }
  | { op: "revise"; belief: string; statement: string; confidence: number; evidence: string[]; tags: string[]; reason: string }
  | { op: "retract"; belief: string; reason: string };

export interface ConsolidationInput {
  episodes: { id: string; content: EpisodeContent; summary?: string }[];
  beliefs: Belief[];
  /** Optional domain hint, e.g. "You manage a crypto wallet for one owner." */
  context?: string;
}

const SYSTEM = `You are the memory consolidator of an AI agent — the part that "sleeps" on new experiences and turns them into durable beliefs.

You receive the agent's CURRENT BELIEFS and a batch of NEW EPISODES (raw observations). Return the smallest set of operations that keeps the beliefs accurate:

- create: a new belief that the episodes support. Beliefs are general, reusable knowledge — habits, schedules, preferences, relationships, rules, facts about the world. Do NOT turn every single event into a belief; one-off events only become beliefs if they are clearly important (e.g. a large unusual transfer, an explicit instruction from the user).
- revise: an existing belief needs a new version — new evidence strengthens it (raise confidence), weakens it (lower confidence), refines it (more precise wording), or contradicts it (change the statement). Include ALL episodes that support the NEW version (old and new evidence).
- retract: an existing belief is now clearly false or superseded and should no longer guide the agent.

Rules:
- Cite evidence ONLY with episode IDs that appear in the input (new episodes or the evidence lists of current beliefs). Never invent IDs.
- Refer to existing beliefs ONLY by their exact id.
- An explicit statement or correction from the user outweighs patterns inferred from data.
- Confidence: 0.3–0.5 for a weak single-observation inference, 0.6–0.8 for a repeated pattern, 0.85–0.97 for a pattern confirmed by the user or seen many times. Never 1.0.
- Statements are one clear sentence, specific (amounts, counterparties, timing) and in the present tense.
- "key" for create is a short snake_case name for the belief, e.g. "rent_payment".
- tags: 1–3 lowercase topic words (e.g. "rent", "income", "security").
- reason: one short sentence a human auditor can read.
- If nothing should change, return an empty list.`;

const SCHEMA: Schema = {
  type: "object",
  properties: {
    ops: {
      type: "array",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["create", "revise", "retract"] },
          key: { type: "string", description: "create only: snake_case name" },
          belief: { type: "string", description: "revise/retract only: existing belief id" },
          statement: { type: "string" },
          confidence: { type: "number" },
          evidence: { type: "array", items: { type: "string" } },
          tags: { type: "array", items: { type: "string" } },
          reason: { type: "string" },
        },
        // Gemini's schema has no conditionals, so ask for every field; retract ignores the extras.
        required: ["op", "statement", "confidence", "evidence", "tags", "reason"],
      },
    },
  },
  required: ["ops"],
};

interface RawOp {
  op?: string;
  key?: string;
  belief?: string;
  statement?: string;
  confidence?: number;
  evidence?: string[];
  tags?: string[];
  reason?: string;
}

export function buildPrompt(input: ConsolidationInput): string {
  const beliefs = input.beliefs.length
    ? input.beliefs
        .map((b) => `- id=${b.id} v${b.version} conf=${b.confidence.toFixed(2)} tags=[${b.tags.join(",")}] evidence=[${b.evidence.join(",")}]\n  "${b.statement}"`)
        .join("\n")
    : "(none yet)";
  const eps = input.episodes
    .map((e) => `- id=${e.id} at=${new Date(e.content.ts).toISOString()} source=${e.content.source}\n  ${JSON.stringify(e.content.data)}`)
    .join("\n");
  return `${input.context ? `CONTEXT: ${input.context}\n\n` : ""}CURRENT BELIEFS:\n${beliefs}\n\nNEW EPISODES (${input.episodes.length}):\n${eps}\n\nReturn the operations as JSON.`;
}

/** Asks the LLM for belief changes and drops anything malformed or ungrounded. */
export async function proposeOps(llm: LLM, input: ConsolidationInput): Promise<{ ops: BeliefOp[]; rejected: { op: unknown; why: string }[] }> {
  const prompt = buildPrompt(input);
  const raw = await llm.json<{ ops?: RawOp[] }>(SYSTEM, prompt, SCHEMA);
  const first = validateOps(raw.ops ?? [], input);
  if (first.rejected.length === 0) return first;

  // One repair round: show the model what was rejected and why, keep whatever it fixes.
  const feedback = first.rejected.map((r) => `- ${r.why}: ${JSON.stringify(r.op)}`).join("\n");
  const accepted = first.ops.map((o) => JSON.stringify(o)).join("\n") || "(none)";
  let repaired: { ops?: RawOp[] };
  try {
    repaired = await llm.json<{ ops?: RawOp[] }>(
      SYSTEM,
      `${prompt}\n\nYour previous answer had operations that were REJECTED:\n${feedback}\n\nThese were ACCEPTED and are already applied — do not repeat them:\n${accepted}\n\nReturn ONLY corrected versions of the rejected operations (with valid episode IDs as evidence), or an empty list if they should be dropped.`,
      SCHEMA,
    );
  } catch {
    return first;
  }
  // Validate repairs against the same input, minus beliefs the first pass already touched.
  const touched = new Set(first.ops.flatMap((o) => (o.op === "create" ? [] : [o.belief])));
  const second = validateOps(
    (repaired.ops ?? []).filter((o) => !o.belief || !touched.has(o.belief)),
    input,
  );
  return { ops: [...first.ops, ...second.ops], rejected: second.rejected };
}

export function validateOps(rawOps: RawOp[], input: ConsolidationInput): { ops: BeliefOp[]; rejected: { op: unknown; why: string }[] } {
  const knownEpisodes = new Set([...input.episodes.map((e) => e.id), ...input.beliefs.flatMap((b) => b.evidence)]);
  const knownBeliefs = new Set(input.beliefs.map((b) => b.id));
  const touched = new Set<string>();
  const ops: BeliefOp[] = [];
  const rejected: { op: unknown; why: string }[] = [];
  const reject = (op: unknown, why: string) => rejected.push({ op, why });

  for (const r of rawOps) {
    const reason = (r.reason ?? "").trim() || "no reason given";
    if (r.op === "retract") {
      if (!r.belief || !knownBeliefs.has(r.belief)) { reject(r, "unknown belief"); continue; }
      if (touched.has(r.belief)) { reject(r, "belief changed twice"); continue; }
      touched.add(r.belief);
      ops.push({ op: "retract", belief: r.belief, reason });
      continue;
    }
    if (r.op !== "create" && r.op !== "revise") { reject(r, "unknown op"); continue; }
    const statement = (r.statement ?? "").trim();
    if (!statement) { reject(r, "empty statement"); continue; }
    const evidence = [...new Set(r.evidence ?? [])];
    const bad = evidence.filter((e) => !knownEpisodes.has(e));
    const good = evidence.filter((e) => knownEpisodes.has(e));
    if (good.length === 0) { reject(r, `no valid evidence${bad.length ? ` (unknown: ${bad.join(",")})` : ""}`); continue; }
    const confidence = clamp(Number(r.confidence ?? 0.5), 0.01, 0.99);
    const tags = [...new Set((r.tags ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean))].slice(0, 3);
    if (r.op === "revise") {
      if (!r.belief || !knownBeliefs.has(r.belief)) { reject(r, "unknown belief"); continue; }
      if (touched.has(r.belief)) { reject(r, "belief changed twice"); continue; }
      touched.add(r.belief);
      ops.push({ op: "revise", belief: r.belief, statement, confidence, evidence: good, tags, reason });
    } else {
      ops.push({ op: "create", key: slug(r.key ?? statement), statement, confidence, evidence: good, tags, reason });
    }
  }
  return { ops, rejected };
}

function clamp(x: number, lo: number, hi: number): number {
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : 0.5;
}

export function slug(s: string): string {
  const out = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32).replace(/_+$/, "");
  return out || "belief";
}

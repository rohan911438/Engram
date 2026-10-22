import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { MoveAnchorer, WalrusBlobAnchorer, type Anchorer, type SuiNetwork } from "./anchor.js";
import { Engram, type ForgetResult, type ObserveInput, type SleepReport, type VerifyReport } from "./engram.js";
import { servicesFromEnv } from "./env.js";
import { GeminiLLM, type LLM } from "./llm.js";
import { InMemoryRemote, WalrusMemoryRemote, type RemoteMemory } from "./remote.js";
import { TatumSui } from "./tatum.js";
import { DEFAULT_SERVER, readLink, removeLink, startLink, syncLink, waitForLink, type LinkInfo, type LinkStart, type SyncResult } from "./link.js";
import type { Belief, Commit, Episode, Receipt } from "./types.js";

/**
 * Settings for `engram()`. Anything left out is read from the environment
 * (`.env`: MEMWAL_KEY, MEMWAL_ACCOUNT_ID, TATUM_API_KEY, GEMINI_API_KEYS, …).
 */
export interface EngramConfig {
  /** Agent name — lowercase letters, digits and dashes. Used for a new repo. */
  agent: string;
  /** Folder for `.engram/` (default: the current directory). */
  dir?: string;
  /** Walrus Memory account, a ready remote, or "memory" for an in-process store (tests). */
  walrus?: { accountId: string; key: string; serverUrl?: string } | RemoteMemory | "memory";
  /** Tatum Sui gateway (mainnet) — wallet reads and anchor checks. */
  tatum?: { apiKey: string };
  /** LLM for `sleep()`: Gemini keys, or any `LLM`. */
  llm?: { gemini: string[]; model?: string } | LLM;
  /** Anchor commits with the engram_anchor Move module. */
  anchor?: { packageId: string; mnemonic: string; network?: SuiNetwork } | Anchorer | false;
  /** Domain hint for consolidation, e.g. "a wallet-watching agent". */
  context?: string;
  /** Where unspecified settings come from (default: process.env). */
  env?: Record<string, string | undefined>;
}

export interface WrapOptions<In, Out> {
  /** What to look up beliefs about (default: the input as JSON). */
  query?: (input: In) => string;
  /** One-line description of the decision for the receipt (default: the output as JSON). */
  action?: (output: Out, input: In) => string;
  /** Beliefs the decision used: ids like "b_rent" (default: every belief the agent was given). */
  used?: (output: Out, beliefs: Belief[]) => string[];
  /** Also record the input as an episode (default true). */
  observe?: boolean | ((input: In) => ObserveInput);
  /** Max beliefs handed to the agent (default 6). */
  limit?: number;
}

/** A wrapped agent: same call, plus the last receipt. */
export interface WrappedAgent<In, Out> {
  (input: In): Promise<Out>;
  /** Receipt of the most recent call (null before the first commit). */
  lastReceipt: Receipt | null;
}

/**
 * The high-level API: one object for an agent's memory.
 *
 * ```ts
 * const mind = engram({ agent: "money-ops" });
 * const agent = mind.wrap(myAgent);         // beliefs in, signed receipts out
 * mind.observe({ source: "tatum", data: tx });
 * await mind.sleep();                       // episodes → beliefs
 * await mind.commit("weekly");              // Merkle root → Walrus → Sui
 * await mind.beliefs({ about: "rent" });
 * mind.at("2026-10-25");                    // time travel
 * mind.forget("ep_…");                      // provable forgetting
 * await mind.verify("r_…");                 // proof check
 * ```
 */
export class Mind {
  readonly core: Engram;
  private llmInstance?: LLM;

  constructor(
    core: Engram,
    private llmFactory: () => LLM,
    private context?: string,
  ) {
    this.core = core;
  }

  get agent(): string {
    return this.core.agent;
  }

  /** Records an episode (encrypted with its own key). */
  observe(input: ObserveInput): Episode {
    return this.core.observe(input);
  }

  /** Consolidates new episodes into beliefs with the configured LLM. */
  sleep(opts: { context?: string; batchSize?: number } = {}): Promise<SleepReport> {
    this.llmInstance ??= this.llmFactory();
    return this.core.sleep({ llm: this.llmInstance, context: opts.context ?? this.context, batchSize: opts.batchSize });
  }

  /**
   * Signs and stores a snapshot of the current beliefs, anchored on Sui. If the
   * agent is linked to a dashboard, the new history is synced too (a failed
   * sync never fails the commit; see `lastSyncError`).
   */
  async commit(message: string): Promise<Commit> {
    const c = await this.core.commit(message);
    if (readLink(this.core)) {
      try {
        await this.sync();
        this.lastSyncError = null;
      } catch (err) {
        this.lastSyncError = (err as Error).message;
      }
    }
    return c;
  }

  /** Why the last automatic sync after commit failed, if it did. */
  lastSyncError: string | null = null;

  /**
   * Links this agent to an Engram web app account (a Sui wallet). `onCode`
   * gets the code and URL to show the owner; resolves once they approve.
   */
  async link(opts: { server?: string; label?: string; onCode: (start: LinkStart) => void }): Promise<LinkInfo> {
    const server = opts.server ?? DEFAULT_SERVER;
    const start = await startLink(this.core, server, opts.label);
    opts.onCode(start);
    return waitForLink(this.core, start, server);
  }

  /** Uploads the audit bundle to the linked dashboard (verified there before it's shown). */
  sync(): Promise<SyncResult> {
    return syncLink(this.core);
  }

  get linked(): LinkInfo | null {
    return readLink(this.core);
  }

  unlink(): boolean {
    return removeLink(this.core);
  }

  /**
   * Current beliefs. With `about`, the most relevant ones (Walrus Memory
   * semantic recall, keyword fallback offline).
   */
  async beliefs(opts: { about?: string; limit?: number } = {}): Promise<Belief[]> {
    if (!opts.about) return this.core.beliefs().slice(0, opts.limit ?? Infinity);
    return this.core.relevant(opts.about, opts.limit ?? 5);
  }

  /** Beliefs as they were at a commit, `HEAD~n`, or a date ("2026-10-25"). */
  at(ref: string): Belief[] {
    return this.core.beliefsAt(ref);
  }

  /** Destroys an episode's key; dependent beliefs are retracted or revised. */
  forget(episodeId: string, reason?: string): ForgetResult {
    return this.core.forget(episodeId, reason);
  }

  /** Verifies a receipt (`r_…`) or a commit (id, `HEAD`, date) end to end. */
  verify(ref: string, opts: { offline?: boolean } = {}): Promise<VerifyReport> {
    const o = opts.offline ? { walrus: false, chain: false } : {};
    return ref.startsWith("r_") ? this.core.verifyReceipt(ref, o) : this.core.verifyCommit(ref, o);
  }

  log(): Commit[] {
    return this.core.head() ? this.core.log() : [];
  }

  diff(from: string, to?: string) {
    return this.core.diff(from, to);
  }

  blame(belief: string) {
    return this.core.blame(belief);
  }

  receipts(): Receipt[] {
    return this.core.receipts();
  }

  /**
   * Wraps an existing agent function. Each call: the relevant committed
   * beliefs are passed in, the agent runs, and a signed receipt records what it
   * decided and which beliefs it relied on.
   *
   * ```ts
   * const agent = mind.wrap(async (tx, beliefs) => decide(tx, beliefs), {
   *   used: (out) => out.beliefIds,
   * });
   * const decision = await agent(tx);
   * agent.lastReceipt; // r_…
   * ```
   */
  wrap<In, Out>(fn: (input: In, beliefs: Belief[]) => Promise<Out> | Out, opts: WrapOptions<In, Out> = {}): WrappedAgent<In, Out> {
    const json = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
    const wrapped = (async (input: In) => {
      if (opts.observe !== false) {
        this.core.observe(typeof opts.observe === "function" ? opts.observe(input) : { source: "agent", data: input });
      }
      const res = await this.core.act({ query: opts.query?.(input) ?? json(input).slice(0, 500), input, limit: opts.limit ?? 6 }, async (beliefs) => {
        const out = await fn(input, beliefs);
        return {
          action: (opts.action?.(out, input) ?? json(out)).slice(0, 2000),
          used: opts.used ? opts.used(out, beliefs) : beliefs.map((b) => b.id),
          result: out,
        };
      });
      wrapped.lastReceipt = res.receipt;
      return res.result;
    }) as WrappedAgent<In, Out>;
    wrapped.lastReceipt = null;
    return wrapped;
  }
}

/** Opens (or creates) an agent's memory. See {@link EngramConfig}. */
export function engram(cfg: EngramConfig): Mind {
  const env = cfg.env ?? process.env;
  const fromEnv = servicesFromEnv(env);
  const dir = resolve(cfg.dir ?? ".");

  const remote: RemoteMemory =
    cfg.walrus === "memory"
      ? new InMemoryRemote()
      : cfg.walrus && "putMany" in cfg.walrus
        ? cfg.walrus
        : cfg.walrus
          ? new WalrusMemoryRemote({ key: cfg.walrus.key, accountId: cfg.walrus.accountId, serverUrl: cfg.walrus.serverUrl })
          : fromEnv.remote;

  const tatum = cfg.tatum ? new TatumSui({ apiKey: cfg.tatum.apiKey }) : fromEnv.tatum;
  // A Walrus Memory account given in the config (not "memory", not a ready remote).
  const account = typeof cfg.walrus === "object" && !("putMany" in cfg.walrus) ? cfg.walrus : undefined;
  const blobAnchorer = account && tatum ? new WalrusBlobAnchorer(tatum, account.accountId) : undefined;
  let anchorer: Anchorer | undefined;
  if (cfg.anchor && "check" in cfg.anchor) anchorer = cfg.anchor;
  else if (cfg.anchor === false || cfg.walrus === "memory") anchorer = undefined;
  else if (cfg.anchor) anchorer = new MoveAnchorer({ ...cfg.anchor, tatum, blobAnchorer: blobAnchorer ?? fromEnv.anchorer });
  else anchorer = blobAnchorer ?? fromEnv.anchorer;

  const llmFactory = (): LLM => {
    if (cfg.llm && "json" in cfg.llm) return cfg.llm;
    if (cfg.llm) return new GeminiLLM({ apiKeys: cfg.llm.gemini, model: cfg.llm.model });
    return fromEnv.llm();
  };

  const opts = { dir, remote, anchorer };
  const core = existsSync(join(dir, ".engram", "config.json")) ? Engram.open(opts) : Engram.init(cfg.agent, opts);
  if (core.agent !== cfg.agent) throw new Error(`${dir} holds agent "${core.agent}", not "${cfg.agent}"`);
  return new Mind(core, llmFactory, cfg.context);
}

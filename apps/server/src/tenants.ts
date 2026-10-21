import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Engram, NothingToCommitError, type Anchorer, type LLM, type RemoteMemory, type TatumSui } from "@engram/sdk";
import { CONTEXT, MoneyOpsAgent, WalletFeed, describe, type Handled } from "@engram/money-ops";

export interface Services {
  remote: RemoteMemory;
  anchorer?: Anchorer;
  tatum?: TatumSui;
  llm: () => LLM;
}

export interface Job {
  id: string;
  kind: "sync" | "learn" | "commit" | "run";
  status: "running" | "done" | "failed";
  log: { ts: number; text: string }[];
  result?: unknown;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

/**
 * One wallet's agent: its Engram repo on disk, the money-ops agent, the
 * Tatum wallet feed and the jobs it has run. Only one job runs at a time.
 */
export class Tenant {
  readonly engram: Engram;
  readonly agent: MoneyOpsAgent | null;
  readonly feed: WalletFeed | null;
  private jobs: Job[] = [];
  private statePath: string;

  constructor(
    readonly address: string,
    readonly dir: string,
    private services: Services,
    readonly readOnly = false,
  ) {
    mkdirSync(dir, { recursive: true });
    const opts = { dir, remote: services.remote, anchorer: services.anchorer };
    this.engram = existsSync(join(dir, ".engram", "config.json")) ? Engram.open(opts) : Engram.init(agentName(address), opts);
    this.statePath = join(dir, "feed-state.json");
    this.agent = readOnly ? null : new MoneyOpsAgent(this.engram, lazyLlm(services.llm));
    this.feed = readOnly || !services.tatum ? null : new WalletFeed(services.tatum, address);
  }

  get current(): Job | undefined {
    return this.jobs.find((j) => j.status === "running");
  }

  job(id: string): Job | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  recentJobs(): Job[] {
    return this.jobs.slice(-10).reverse();
  }

  private seen(): Set<string> {
    return new Set(existsSync(this.statePath) ? (JSON.parse(readFileSync(this.statePath, "utf8")) as string[]) : []);
  }

  /** Starts a background job, or returns the one already running. */
  start(kind: Job["kind"], params: { message?: string } = {}): Job {
    if (this.readOnly) throw new Error("the demo agent is read-only");
    if (this.current) return this.current;
    const job: Job = { id: `j_${Date.now().toString(36)}`, kind, status: "running", log: [], startedAt: Date.now() };
    this.jobs.push(job);
    const log = (text: string) => job.log.push({ ts: Date.now(), text });
    const steps: Record<Job["kind"], () => Promise<unknown>> = {
      sync: () => this.sync(log),
      learn: () => this.learn(log),
      commit: () => this.commit(log, params.message),
      run: async () => ({ sync: await this.sync(log), learn: await this.learn(log), commit: await this.commit(log, params.message) }),
    };
    steps[kind]()
      .then((r) => {
        job.result = r;
        job.status = "done";
      })
      .catch((err: Error) => {
        job.error = err.message;
        job.status = "failed";
        log(`failed: ${err.message}`);
      })
      .finally(() => (job.finishedAt = Date.now()));
    return job;
  }

  /** Pull new wallet transactions via Tatum and let the agent judge them. */
  async sync(log: (t: string) => void): Promise<{ events: number; alerts: number; decisions: { summary: string; alert: boolean; severity: string; message: string; receipt: string | null }[] }> {
    if (!this.feed || !this.agent) throw new Error("wallet feed unavailable (no Tatum key)");
    log("Reading your wallet's latest transactions from Sui via Tatum…");
    const seen = this.seen();
    const events = await this.feed.fetch(seen, 25);
    log(`${events.length} new wallet event(s)`);
    if (events.length === 0) return { events: 0, alerts: 0, decisions: [] };
    log("Agent is judging them against its committed beliefs…");
    const handled: Handled[] = await this.agent.handleMany(events);
    for (const h of handled) seen.add(h.event.digest);
    writeFileSync(this.statePath, JSON.stringify([...seen]));
    const alerts = handled.filter((h) => h.assessment.alert).length;
    log(`${alerts} alert(s), ${handled.length - alerts} quiet`);
    return {
      events: handled.length,
      alerts,
      decisions: handled.map((h) => ({ summary: describe(h.event), alert: h.assessment.alert, severity: h.assessment.severity, message: h.assessment.message, receipt: h.receipt?.id ?? null })),
    };
  }

  async learn(log: (t: string) => void) {
    const n = this.engram.pendingEpisodes().length;
    if (n === 0) {
      log("Nothing new to learn from");
      return { episodes: 0, created: 0, revised: 0, retracted: 0 };
    }
    log(`Sleeping on ${n} new episode(s) — consolidating into beliefs…`);
    const r = await this.engram.sleep({ llm: this.services.llm(), context: CONTEXT });
    log(`${r.created.length} new, ${r.revised.length} revised, ${r.retracted.length} retracted belief(s)`);
    return { episodes: r.episodes, created: r.created.length, revised: r.revised.length, retracted: r.retracted.length };
  }

  async commit(log: (t: string) => void, message?: string) {
    log("Committing: Merkle root → signed manifest → Walrus Memory → Sui anchor…");
    try {
      const c = await this.engram.commit(message?.trim() || `Learned from wallet activity (${new Date().toISOString().slice(0, 10)})`);
      log(c.anchor ? `Commit ${c.id.slice(0, 8)} anchored in Sui checkpoint ${c.anchor.checkpoint}` : `Commit ${c.id.slice(0, 8)} stored on Walrus; anchor pending`);
      return { commit: c.id, anchored: !!c.anchor };
    } catch (err) {
      if (err instanceof NothingToCommitError) {
        log("Beliefs unchanged — nothing to commit");
        return { commit: null, anchored: false };
      }
      throw err;
    }
  }

  tell(message: string) {
    if (this.readOnly || !this.agent) throw new Error("the demo agent is read-only");
    const text = message.trim();
    if (!text) throw new Error("say something to your agent");
    if (text.length > 2000) throw new Error("message too long (2000 characters max)");
    return this.agent.ownerSays(text);
  }

  forget(episodeId: string) {
    if (this.readOnly) throw new Error("the demo agent is read-only");
    return this.engram.forget(episodeId, "forgotten by the wallet owner");
  }
}

/** Agent names must be short and lowercase; derived from the address. */
export function agentName(address: string): string {
  return `w-${address.slice(2, 12).toLowerCase()}`;
}

/** Defers creating the LLM until it's needed, so read-only use never needs a key. */
function lazyLlm(make: () => LLM): LLM {
  let inner: LLM | undefined;
  return {
    get name() {
      return (inner ??= make()).name;
    },
    json: (s, p, schema) => (inner ??= make()).json(s, p, schema),
  };
}

export class Tenants {
  private cache = new Map<string, Tenant>();
  constructor(
    private root: string,
    private services: Services,
  ) {}

  forWallet(address: string): Tenant {
    let t = this.cache.get(address);
    if (!t) {
      t = new Tenant(address, join(this.root, "wallets", address), this.services);
      this.cache.set(address, t);
    }
    return t;
  }

  all(): Tenant[] {
    return [...this.cache.values()];
  }
}

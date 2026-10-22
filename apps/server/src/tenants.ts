import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CombinedRemote, Engram, NothingToCommitError, delegateFromSecret, newDelegateKey, type Anchorer, type LLM, type RemoteMemory, type TatumSui } from "@engram/sdk";
import { CONTEXT, MoneyOpsAgent, WalletFeed, describe, type Handled } from "@engram/money-ops";

export interface Services {
  remote: RemoteMemory;
  anchorer?: Anchorer;
  tatum?: TatumSui;
  llm: () => LLM;
  /** Walrus Memory for the wallet owner's own account, via the delegate key they authorized. */
  remoteFor?: (accountId: string, delegateSecret: string) => RemoteMemory;
}

/** Where a wallet's agent stores its memory. */
export interface StorageState {
  /** "own" = the wallet owner's Walrus Memory account; "hosted" = Engram's shared account. */
  mode: "hosted" | "own";
  /** Server-held delegate key (suiprivkey1…) the owner authorizes on their account. */
  delegateSecret: string;
  accountId?: string;
  /** When the agent switched to its own account. */
  since?: number;
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
  engram!: Engram;
  agent: MoneyOpsAgent | null = null;
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
    this.statePath = join(dir, "feed-state.json");
    this.storagePath = join(dir, "storage.json");
    this.open();
    this.feed = readOnly || !services.tatum ? null : new WalletFeed(services.tatum, address);
  }

  private storagePath: string;

  /** (Re)opens the Engram repo with the remote that matches the storage setting. */
  private open() {
    const opts = { dir: this.dir, remote: this.remote(), anchorer: this.services.anchorer };
    this.engram = existsSync(join(this.dir, ".engram", "config.json")) ? Engram.open(opts) : Engram.init(agentName(this.address), opts);
    this.agent = this.readOnly ? null : new MoneyOpsAgent(this.engram, lazyLlm(this.services.llm));
  }

  private remote(): RemoteMemory {
    const s = this.readOnly ? null : this.storageState();
    if (s?.mode === "own" && s.accountId && this.services.remoteFor) {
      // New memories go to the owner's account; older ones stay readable where they were written.
      return new CombinedRemote(this.services.remoteFor(s.accountId, s.delegateSecret), this.services.remote);
    }
    return this.services.remote;
  }

  /** Storage settings, creating this agent's delegate key the first time. */
  storageState(): StorageState {
    if (existsSync(this.storagePath)) return JSON.parse(readFileSync(this.storagePath, "utf8")) as StorageState;
    const s: StorageState = { mode: "hosted", delegateSecret: newDelegateKey().secret };
    writeFileSync(this.storagePath, JSON.stringify(s, null, 2), { mode: 0o600 });
    return s;
  }

  delegate(): { publicKey: string; suiAddress: string } {
    return delegateFromSecret(this.storageState().delegateSecret);
  }

  /** Switches where new memories are written. Waits for any running job. */
  useStorage(mode: StorageState["mode"], accountId?: string) {
    if (this.current) throw new Error("wait for the running job to finish");
    const s = this.storageState();
    const next: StorageState = mode === "own" ? { ...s, mode, accountId, since: Date.now() } : { ...s, mode: "hosted" };
    writeFileSync(this.storagePath, JSON.stringify(next, null, 2), { mode: 0o600 });
    this.open();
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
      run: async () => {
        // A wallet-feed outage shouldn't stop the agent learning from what it was told.
        const sync = await this.sync(log).catch((err: Error) => {
          log(`Wallet sync skipped: ${err.message}`);
          return { events: 0, alerts: 0, decisions: [], error: err.message };
        });
        return { sync, learn: await this.learn(log), commit: await this.commit(log, params.message) };
      },
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

/** Last LLM failure in the past 30 minutes (quota, outage) — shown as "degraded". */
let llmFailure: { at: number; message: string } | null = null;
export function lastLlmError(): string | null {
  return llmFailure && Date.now() - llmFailure.at < 30 * 60_000 ? llmFailure.message : null;
}

/** Defers creating the LLM until it's needed, so read-only use never needs a key. */
function lazyLlm(make: () => LLM): LLM {
  let inner: LLM | undefined;
  return {
    get name() {
      return (inner ??= make()).name;
    },
    json: async <T,>(s: string, p: string, schema: Parameters<LLM["json"]>[2]): Promise<T> => {
      try {
        const r = await (inner ??= make()).json<T>(s, p, schema);
        llmFailure = null;
        return r;
      } catch (err) {
        const msg = (err as Error).message;
        llmFailure = { at: Date.now(), message: /quota|429|exhaust/i.test(msg) ? "LLM daily quota used up — learning resumes when it resets" : `LLM error: ${msg.slice(0, 120)}` };
        throw err;
      }
    },
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

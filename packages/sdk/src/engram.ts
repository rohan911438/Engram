import { join, resolve } from "node:path";
import { canonical, decrypt, encrypt, generateKeyPair, hexToBytes, newDataKey, publicKeyOf, randomId, sha256Hex, sign } from "./crypto.js";
import { LocalStore } from "./store.js";
import { KeyVault } from "./vault.js";
import type { RemoteMemory } from "./remote.js";
import type { Envelope, Episode, EpisodeContent, EpisodeSource } from "./types.js";

export interface EngramConfig {
  v: 1;
  agent: string;
  agentPubKey: string;
  createdAt: number;
  namespaces: { episodes: string; beliefs: string; commits: string; receipts: string };
}

export interface OpenOptions {
  /** Folder that contains (or will contain) `.engram/`. Default: cwd. */
  dir?: string;
  remote: RemoteMemory;
}

export interface ObserveInput {
  source: EpisodeSource;
  data: unknown;
  /** Short label shown in logs. Stored in the clear locally — keep it non-sensitive. */
  summary?: string;
  ts?: number;
}

export interface PushResult {
  episodes: number;
  beliefs: number;
  receipts: number;
}

export class Engram {
  readonly store: LocalStore;
  readonly vault: KeyVault;
  readonly config: EngramConfig;
  readonly remote: RemoteMemory;
  private secretKey: string;

  private constructor(store: LocalStore, remote: RemoteMemory) {
    this.store = store;
    this.remote = remote;
    const config = store.file<EngramConfig>("config.json").read();
    if (!config) throw new Error(`No Engram repo at ${store.root}. Run \`engram init\` first.`);
    this.config = config;
    const sk = store.readText("agent.key");
    const mk = store.readText("master.key");
    if (!sk || !mk) throw new Error("Missing agent.key or master.key in .engram/");
    if (publicKeyOf(sk) !== config.agentPubKey) throw new Error("agent.key does not match config.json");
    this.secretKey = sk;
    this.vault = new KeyVault(store.file("vault.json"), hexToBytes(mk));
  }

  /** Creates `.engram/` with a fresh agent signing key and master key. */
  static init(agent: string, opts: OpenOptions): Engram {
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(agent)) {
      throw new Error("agent name: lowercase letters, digits and dashes only");
    }
    const store = new LocalStore(join(resolve(opts.dir ?? "."), ".engram"));
    if (store.exists()) throw new Error(`Engram repo already exists at ${store.root}`);
    const kp = generateKeyPair();
    store.writeText("agent.key", kp.secretKey);
    store.writeText("master.key", newDataKey().toString("hex"));
    const ns = (k: string) => `engram-${agent}-${k}`;
    store.file<EngramConfig>("config.json").write({
      v: 1,
      agent,
      agentPubKey: kp.publicKey,
      createdAt: Date.now(),
      namespaces: { episodes: ns("episodes"), beliefs: ns("beliefs"), commits: ns("commits"), receipts: ns("receipts") },
    });
    return new Engram(store, opts.remote);
  }

  static open(opts: OpenOptions): Engram {
    return new Engram(new LocalStore(join(resolve(opts.dir ?? "."), ".engram")), opts.remote);
  }

  get agent(): string {
    return this.config.agent;
  }

  get publicKey(): string {
    return this.config.agentPubKey;
  }

  /** Signs with the agent key (commits and receipts). */
  protected signRaw(message: string): string {
    return sign(message, this.secretKey);
  }

  // ---- Episodes ------------------------------------------------------------

  /** Records a raw event, encrypted with its own key. Stored locally; `push()` uploads it. */
  observe(input: ObserveInput): Episode {
    const id = randomId("ep");
    const ts = input.ts ?? Date.now();
    const content: EpisodeContent = { source: input.source, ts, data: input.data };
    const plaintext = canonical(content);
    const { keyId, key } = this.vault.create();
    const sealed = encrypt(Buffer.from(plaintext, "utf8"), key, id);
    const envelope: Envelope = { engram: "episode", v: 1, id, keyId, ...sealed };
    const episode: Episode = {
      id,
      ts,
      source: input.source,
      summary: input.summary,
      contentHash: sha256Hex(plaintext),
      keyId,
      envelope,
    };
    this.store.put("episodes", id, episode);
    return episode;
  }

  episodes(): Episode[] {
    return this.store.list<Episode>("episodes").sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
  }

  episode(id: string): Episode | null {
    return this.store.get<Episode>("episodes", id);
  }

  /** Decrypts an episode. Returns null if it was forgotten. Throws if it was tampered with. */
  read(id: string): EpisodeContent | null {
    const ep = this.episode(id);
    if (!ep) throw new Error(`unknown episode ${id}`);
    const key = this.vault.get(ep.keyId);
    if (!key) return null;
    const plaintext = decrypt(ep.envelope, key, ep.id).toString("utf8");
    if (sha256Hex(plaintext) !== ep.contentHash) throw new Error(`episode ${id} content hash mismatch`);
    return JSON.parse(plaintext) as EpisodeContent;
  }

  // ---- Sync ----------------------------------------------------------------

  /** Uploads everything not yet on Walrus Memory and records the blob IDs. */
  async push(): Promise<PushResult> {
    const ns = this.config.namespaces;
    const eps = this.episodes().filter((e) => !e.blobId);
    const items = eps.map((e) => ({ namespace: ns.episodes, text: canonical(e.envelope) }));
    const blobIds = await this.remote.putMany(items);
    eps.forEach((e, i) => this.store.put("episodes", e.id, { ...e, blobId: blobIds[i] }));
    return { episodes: eps.length, beliefs: 0, receipts: 0 };
  }
}

import { MoveAnchorer, WalrusBlobAnchorer, type Anchorer } from "./anchor.js";
import { GeminiLLM, type LLM } from "./llm.js";
import { WalrusMemoryRemote, type RemoteHit, type RemoteMemory } from "./remote.js";
import { TatumSui } from "./tatum.js";

/**
 * Settings read from the environment (`.env`):
 *   MEMWAL_KEY, MEMWAL_ACCOUNT_ID, MEMWAL_SERVER_URL   Walrus Memory
 *   TATUM_API_KEY (or TATUM_API_KEY_MAINNET)            Tatum Sui RPC
 *   GEMINI_API_KEYS (comma-separated), GEMINI_MODEL     consolidation LLM
 *   ENGRAM_ANCHOR_PACKAGE + SUI_MNEMONIC                anchor commits with the engram_anchor Move module
 *   ENGRAM_ANCHOR_NETWORK                               mainnet (default, via Tatum) or testnet
 */
export interface EnvServices {
  remote: RemoteMemory;
  tatum?: TatumSui;
  anchorer?: Anchorer;
  /** Set when the Move-module anchorer could not be used, and why. */
  anchorWarning?: string;
  /** Throws a helpful error if no LLM key is configured. */
  llm(): LLM;
}

export function servicesFromEnv(env: Record<string, string | undefined> = process.env): EnvServices {
  const tatumKey = env.TATUM_API_KEY ?? env.TATUM_API_KEY_MAINNET;
  const tatum = tatumKey ? new TatumSui({ apiKey: tatumKey }) : undefined;
  const accountId = env.MEMWAL_ACCOUNT_ID;
  let anchorer: Anchorer | undefined = tatum && accountId ? new WalrusBlobAnchorer(tatum, accountId) : undefined;
  let anchorWarning: string | undefined;
  if (env.ENGRAM_ANCHOR_PACKAGE) {
    try {
      const network = env.ENGRAM_ANCHOR_NETWORK === "testnet" ? "testnet" : "mainnet";
      anchorer = new MoveAnchorer({ network, tatum, tatumApiKey: tatumKey, packageId: env.ENGRAM_ANCHOR_PACKAGE, mnemonic: env.SUI_MNEMONIC ?? "", blobAnchorer: anchorer });
    } catch (err) {
      anchorWarning = `ENGRAM_ANCHOR_PACKAGE set but Move anchoring is unusable (${(err as Error).message}) — using Walrus Blob anchoring`;
    }
  }
  return {
    remote: new LazyRemote(() => {
      if (!env.MEMWAL_KEY || !accountId) throw new Error("Walrus Memory is not configured: set MEMWAL_KEY and MEMWAL_ACCOUNT_ID in .env");
      return new WalrusMemoryRemote({ key: env.MEMWAL_KEY, accountId, serverUrl: env.MEMWAL_SERVER_URL });
    }),
    tatum,
    anchorer,
    anchorWarning,
    llm() {
      const keys = (env.GEMINI_API_KEYS ?? env.GEMINI_API_KEY ?? "").split(",").filter(Boolean);
      if (keys.length === 0) throw new Error("No LLM configured: set GEMINI_API_KEYS in .env");
      return new GeminiLLM({ apiKeys: keys, model: env.GEMINI_MODEL });
    },
  };
}

/** Creates the real remote only when first used, so offline commands never need keys. */
class LazyRemote implements RemoteMemory {
  private inner?: RemoteMemory;
  constructor(private make: () => RemoteMemory) {}
  private get(): RemoteMemory {
    this.inner ??= this.make();
    return this.inner;
  }
  putMany(items: { namespace: string; text: string }[]): Promise<string[]> {
    return items.length === 0 ? Promise.resolve([]) : this.get().putMany(items);
  }
  search(namespace: string, query: string, limit?: number): Promise<RemoteHit[]> {
    return this.get().search(namespace, query, limit);
  }
}

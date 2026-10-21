import { beliefKey, type Engram } from "./engram.js";
import type { Belief, Episode } from "./types.js";

/** Episode as shown in a UI — no ciphertext. */
export function episodeView(e: Episode) {
  return { id: e.id, ts: e.ts, source: e.source, summary: e.summary ?? null, blobId: e.blobId ?? null, forgotten: !!e.forgottenAt, forgottenAt: e.forgottenAt ?? null, consolidated: !!e.consolidatedAt };
}

export type InspectHandler = (query: URLSearchParams, rest: string) => unknown | Promise<unknown>;

/**
 * Read-only JSON views of one Engram repo, used by `engram ui` and the web
 * server. Keys are the endpoint names under `/api/`.
 */
export function inspectApi(engram: Engram): Record<string, InspectHandler> {
  return {
    summary: () => {
      const head = engram.head();
      const eps = engram.episodes();
      return {
        agent: engram.agent,
        publicKey: engram.publicKey,
        head,
        headCommit: head ? engram.getCommit(head) : null,
        namespaces: engram.config.namespaces,
        createdAt: engram.config.createdAt,
        counts: {
          episodes: eps.length,
          forgotten: eps.filter((e) => e.forgottenAt).length,
          beliefs: engram.beliefs().length,
          beliefVersions: engram.beliefVersions().length,
          commits: head ? engram.log().length : 0,
          receipts: engram.receipts().length,
          pending: engram.pendingEpisodes().length,
          unpushed: eps.filter((e) => !e.blobId && !e.forgottenAt).length,
        },
      };
    },
    commits: () =>
      engram.log().map((c) => {
        const d = c.manifest.parent ? engram.diff(c.manifest.parent, c.id) : { added: engram.beliefsAt(c.id), changed: [], removed: [] };
        return { ...c, diff: { added: d.added.map(beliefKey), changed: d.changed.map(([a, b]) => [beliefKey(a), beliefKey(b)]), removed: d.removed.map(beliefKey) } };
      }),
    state: (q) => {
      const at = q.get("at");
      const beliefs: Belief[] = at ? engram.beliefsAt(at) : engram.beliefs();
      const ids = new Set(beliefs.flatMap((b) => b.evidence));
      return { ref: at, beliefs, episodes: engram.episodes().filter((e) => ids.has(e.id)).map(episodeView) };
    },
    episodes: () => engram.episodes().map(episodeView).reverse(),
    belief: (_q, ref) => {
      const { belief, history, evidence } = engram.blame(decodeURIComponent(ref));
      return { belief, history, evidence: evidence.map((x) => ({ episode: episodeView(x.episode), content: x.content })) };
    },
    diff: (q) => {
      const d = engram.diff(q.get("from")!, q.get("to") ?? undefined);
      return { added: d.added, changed: d.changed, removed: d.removed };
    },
    receipts: () => engram.receipts().reverse(),
    verify: async (q, ref) => {
      const r = decodeURIComponent(ref);
      const opts = q.get("offline") ? { walrus: false, chain: false } : {};
      return r.startsWith("r_") ? engram.verifyReceipt(r, opts) : engram.verifyCommit(r, opts);
    },
  };
}

import type { Anchorer } from "./anchor.js";
import { canonical, verifySignature } from "./crypto.js";
import { beliefKey, type Engram } from "./engram.js";
import { buildCommitTree, commitId, verifyBeliefProof, verifyManifestSignature } from "./proof.js";
import type { Belief, Commit, Receipt } from "./types.js";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { LocalStore } from "./store.js";

/**
 * A self-contained audit file: the agent's commit history, every belief
 * version those commits reference, and its decision receipts. Anyone can
 * re-check it without the agent's repo (`verifyAudit`). Raw episodes are not
 * included — they stay encrypted; beliefs cite them by ID and Walrus blob.
 */
export interface AuditBundle {
  engram: "audit";
  v: 1;
  agent: string;
  agentPubKey: string;
  exportedAt: number;
  head: string | null;
  /** Newest first, back to the first commit. */
  commits: Commit[];
  beliefs: Belief[];
  receipts: Receipt[];
}

export function exportAudit(e: Engram, opts: { receipts?: boolean } = {}): AuditBundle {
  const head = e.head();
  const commits = head ? e.log() : [];
  const keys = new Set(commits.flatMap((c) => c.manifest.beliefs));
  const beliefs = [...keys].map((k) => e.belief(k)).filter((b): b is Belief => !!b);
  return {
    engram: "audit",
    v: 1,
    agent: e.agent,
    agentPubKey: e.publicKey,
    exportedAt: Date.now(),
    head,
    commits,
    beliefs,
    receipts: opts.receipts === false ? [] : e.receipts().filter((r) => commits.some((c) => c.id === r.commitId)),
  };
}

export interface AuditCheck {
  subject: string;
  ok: boolean;
  detail: string;
  skipped?: boolean;
}

export interface AuditReport {
  ok: boolean;
  checks: AuditCheck[];
  summary: { commits: number; receipts: number; anchored: number };
}

/**
 * Re-checks an audit bundle from scratch: each commit's ID, signature,
 * Merkle root (rebuilt from the included beliefs) and parent link; each
 * receipt's signature and Merkle proofs. With an `anchorer`, also re-reads
 * every commit's anchor on Sui.
 */
export async function verifyAudit(bundle: AuditBundle, opts: { anchorer?: Anchorer } = {}): Promise<AuditReport> {
  const checks: AuditCheck[] = [];
  const add = (subject: string, ok: boolean, detail: string, skipped = false) => checks.push({ subject, ok, detail, skipped });
  if (bundle.engram !== "audit" || bundle.v !== 1) throw new Error("not an Engram audit bundle (v1)");

  const beliefs = new Map(bundle.beliefs.map((b) => [beliefKey(b), b]));
  const commits = new Map(bundle.commits.map((c) => [c.id, c]));
  let anchored = 0;

  for (const c of bundle.commits) {
    const m = c.manifest;
    const s = `commit ${c.id.slice(0, 8)}`;
    const problems: string[] = [];
    if (commitId(m) !== c.id) problems.push("ID is not the hash of its manifest");
    if (m.agentPubKey !== bundle.agentPubKey) problems.push("signed by a different agent key");
    if (!verifyManifestSignature(m, c.signature)) problems.push("bad signature");
    const missing = m.beliefs.filter((k) => !beliefs.has(k));
    if (missing.length) problems.push(`missing beliefs ${missing.join(", ")}`);
    else if (buildCommitTree(m.beliefs.map((k) => beliefs.get(k)!), m.tombstones).tree.root !== m.merkleRoot) problems.push("beliefs don't rebuild the Merkle root");
    if (m.parent && !commits.has(m.parent)) problems.push(`parent ${m.parent.slice(0, 8)} not in the bundle`);
    else if (m.parent && commits.get(m.parent)!.manifest.ts > m.ts) problems.push("parent is newer than the commit");
    add(s, problems.length === 0, problems.length ? problems.join("; ") : `signed, ${m.beliefs.length} beliefs + ${m.tombstones.length} tombstones → root ${m.merkleRoot.slice(0, 10)}…`);

    if (!opts.anchorer) continue;
    if (!c.anchor || !c.manifestBlobId) {
      add(`${s} anchor`, false, "no Sui anchor");
      continue;
    }
    try {
      const r = await opts.anchorer.check(c.anchor, c.manifestBlobId, c);
      if (r.ok) anchored++;
      add(`${s} anchor`, r.ok, r.detail);
    } catch (err) {
      add(`${s} anchor`, true, `could not reach Sui: ${(err as Error).message}`, true);
    }
  }
  if (bundle.head && bundle.commits[0]?.id !== bundle.head) add("head", false, "the newest commit is not the bundle's head");

  for (const r of bundle.receipts) {
    const s = `receipt ${r.id}`;
    const { signature, blobId: _b, ...body } = r;
    const c = commits.get(r.commitId);
    const problems: string[] = [];
    if (r.agentPubKey !== bundle.agentPubKey || !verifySignature(canonical(body), signature, r.agentPubKey)) problems.push("bad signature");
    if (!c) problems.push(`points at commit ${r.commitId.slice(0, 8)}, not in the bundle`);
    else {
      const bad = r.beliefs.filter((k) => !beliefs.has(k) || !r.proofs[k] || !verifyBeliefProof(beliefs.get(k)!, r.proofs[k]!, c.manifest.merkleRoot));
      if (bad.length) problems.push(`invalid proof for ${bad.join(", ")}`);
      if (r.ts < c.manifest.ts) problems.push("decided before its commit existed");
    }
    add(s, problems.length === 0, problems.length ? problems.join("; ") : `"${r.action.slice(0, 60)}" — ${r.beliefs.length} belief(s) proven in ${r.commitId.slice(0, 8)}`);
  }

  return { ok: checks.every((x) => x.ok), checks, summary: { commits: bundle.commits.length, receipts: bundle.receipts.length, anchored } };
}

/**
 * Rebuilds a read-only repo from a (verified) audit bundle at `dir/.engram`,
 * replacing whatever was there. Open it with `Engram.open({ dir, readOnly: true, … })`.
 */
export function importAudit(bundle: AuditBundle, dir: string): void {
  const root = join(dir, ".engram");
  rmSync(root, { recursive: true, force: true });
  const store = new LocalStore(root);
  const ns = (k: string) => `engram-${bundle.agent}-${k}`;
  const first = bundle.commits.at(-1);
  store.file("config.json").write({
    v: 1,
    agent: bundle.agent,
    agentPubKey: bundle.agentPubKey,
    createdAt: first?.manifest.ts ?? bundle.exportedAt,
    namespaces: { episodes: ns("episodes"), beliefs: ns("beliefs"), commits: ns("commits"), receipts: ns("receipts") },
  });
  for (const c of bundle.commits) store.put("commits", c.id, c);
  for (const b of bundle.beliefs) store.put("beliefs", beliefKey(b), b);
  for (const r of bundle.receipts) store.put("receipts", r.id, r);
  if (bundle.head) store.writeText("HEAD", bundle.head);
}

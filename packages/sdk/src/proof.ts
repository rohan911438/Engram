import { canonical, sha256Hex, verifySignature } from "./crypto.js";
import { MerkleTree, verifyProof } from "./merkle.js";
import type { Belief, CommitManifest, MerkleProofStep } from "./types.js";

/**
 * Leaf for one belief version. Commits to everything that matters about it —
 * change a word, the confidence or the evidence, and the root changes.
 */
export function beliefLeaf(b: Belief): string {
  return sha256Hex(
    canonical({
      k: "belief",
      id: b.id,
      version: b.version,
      statement: sha256Hex(b.statement),
      confidence: b.confidence,
      evidence: new MerkleTree([...b.evidence].sort().map((e) => sha256Hex(e))).root,
      tags: [...b.tags].sort(),
    }),
  );
}

/** Leaf recording that an episode was forgotten, so forgetting is itself part of the proof. */
export function tombstoneLeaf(episodeId: string): string {
  return sha256Hex(canonical({ k: "tombstone", episode: episodeId }));
}

export interface CommitTree {
  tree: MerkleTree;
  /** "belief:b_x@2" / "tombstone:ep_1", in leaf order */
  labels: string[];
}

/** Leaves sorted by label, so the same belief set always gives the same root. */
export function buildCommitTree(beliefs: Belief[], tombstones: string[]): CommitTree {
  const entries = [
    ...beliefs.map((b) => ({ label: `belief:${b.id}@${b.version}`, leaf: beliefLeaf(b) })),
    ...tombstones.map((t) => ({ label: `tombstone:${t}`, leaf: tombstoneLeaf(t) })),
  ].sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return { tree: new MerkleTree(entries.map((e) => e.leaf)), labels: entries.map((e) => e.label) };
}

export function proofFor(ct: CommitTree, beliefKey: string): MerkleProofStep[] {
  const i = ct.labels.indexOf(`belief:${beliefKey}`);
  if (i < 0) throw new Error(`belief ${beliefKey} is not in this commit`);
  return ct.tree.proof(i);
}

export function verifyBeliefProof(b: Belief, proof: MerkleProofStep[], root: string): boolean {
  return verifyProof(beliefLeaf(b), proof, root);
}

/** Commit ID = sha256 of the canonical manifest. */
export function commitId(m: CommitManifest): string {
  return sha256Hex(canonical(m));
}

export function verifyManifestSignature(m: CommitManifest, signature: string): boolean {
  return verifySignature(canonical(m), signature, m.agentPubKey);
}

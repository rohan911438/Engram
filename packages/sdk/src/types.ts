/** Where an episode came from. */
export type EpisodeSource = "user" | "tool" | "tatum" | "agent" | "system";

/** Encrypted payload as stored on Walrus Memory and on disk. */
export interface Envelope {
  /** Format marker so Engram can recognise its own memories. */
  engram: "episode";
  v: 1;
  id: string;
  keyId: string;
  /** base64 AES-256-GCM nonce, ciphertext and auth tag. */
  iv: string;
  ct: string;
  tag: string;
}

/** An immutable raw event. Its plaintext only exists encrypted. */
export interface Episode {
  id: string;
  ts: number;
  source: EpisodeSource;
  /** Short, non-sensitive label shown in logs (e.g. "transfer 450 USDC"). */
  summary?: string;
  /** sha256 of the canonical plaintext, before encryption. */
  contentHash: string;
  keyId: string;
  envelope: Envelope;
  /** Walrus blob ID, set once pushed. */
  blobId?: string;
  /** Set when the episode's key was destroyed. */
  forgottenAt?: number;
}

/** The decrypted contents of an episode. */
export interface EpisodeContent {
  source: EpisodeSource;
  ts: number;
  data: unknown;
}

export type BeliefStatus = "active" | "revised" | "retracted";

/** One version of a belief. A new version supersedes the previous one. */
export interface Belief {
  /** Stable belief ID across versions, e.g. "b_rent". */
  id: string;
  version: number;
  statement: string;
  /** 0..1 */
  confidence: number;
  /** Episode IDs that support this version. */
  evidence: string[];
  tags: string[];
  /** Key of the version this one replaced ("b_rent@1"). */
  supersedes?: string;
  status: BeliefStatus;
  createdAt: number;
  /** Why this version exists (from the consolidator). */
  reason?: string;
  blobId?: string;
}

export interface MerkleProofStep {
  /** hex sha256 of the sibling node */
  hash: string;
  /** whether the sibling is on the left */
  left: boolean;
}

/** The signed part of a commit. Hashing this gives the commit ID. */
export interface CommitManifest {
  engram: "commit";
  v: 1;
  agent: string;
  parent: string | null;
  ts: number;
  message: string;
  merkleRoot: string;
  /** "id@version" of every active belief, sorted. */
  beliefs: string[];
  /** Episode IDs whose keys were destroyed (ever), sorted. */
  tombstones: string[];
  /** Episode ID → Walrus blob ID, for every episode referenced by an active belief. */
  episodes: Record<string, string>;
  agentPubKey: string;
}

export interface Anchor {
  method: "walrus-blob";
  /** Sui object ID of the Walrus Blob holding the manifest. */
  objectId: string;
  /** Sui transaction that created it. */
  txDigest: string;
  checkpoint?: string;
  timestampMs?: number;
}

export interface Commit {
  id: string;
  manifest: CommitManifest;
  /** hex Ed25519 signature over the canonical manifest. */
  signature: string;
  manifestBlobId?: string;
  anchor?: Anchor;
}

export interface Receipt {
  engram: "receipt";
  v: 1;
  id: string;
  agent: string;
  commitId: string;
  ts: number;
  action: string;
  inputHash: string;
  /** "id@version" of beliefs used. */
  beliefs: string[];
  proofs: Record<string, MerkleProofStep[]>;
  agentPubKey: string;
  signature: string;
  blobId?: string;
}

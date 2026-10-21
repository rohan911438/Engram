import { bytesToHex, hexToBytes, sha256Bytes } from "./crypto.js";
import type { MerkleProofStep } from "./types.js";

// Domain separation so a leaf can never be passed off as an inner node.
const LEAF = 0x00;
const NODE = 0x01;

function hashLeaf(leafHex: string): string {
  return bytesToHex(sha256Bytes(concat([LEAF], hexToBytes(leafHex))));
}

function hashNode(leftHex: string, rightHex: string): string {
  return bytesToHex(sha256Bytes(concat([NODE], hexToBytes(leftHex), hexToBytes(rightHex))));
}

function concat(prefix: number[], ...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(prefix.length + parts.reduce((n, p) => n + p.length, 0));
  out.set(prefix, 0);
  let o = prefix.length;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Root of an empty tree. */
export const EMPTY_ROOT = bytesToHex(sha256Bytes(new Uint8Array([NODE])));

/**
 * Binary Merkle tree over hex leaf values, in the given order.
 * An odd node at the end of a level is carried up unchanged.
 */
export class MerkleTree {
  private levels: string[][];

  constructor(leaves: string[]) {
    let level = leaves.map(hashLeaf);
    this.levels = [level];
    while (level.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const l = level[i]!;
        const r = level[i + 1];
        next.push(r === undefined ? l : hashNode(l, r));
      }
      this.levels.push(next);
      level = next;
    }
  }

  get root(): string {
    const top = this.levels[this.levels.length - 1]!;
    return top[0] ?? EMPTY_ROOT;
  }

  proof(index: number): MerkleProofStep[] {
    if (index < 0 || index >= this.levels[0]!.length) throw new Error(`leaf ${index} out of range`);
    const steps: MerkleProofStep[] = [];
    let i = index;
    for (let d = 0; d < this.levels.length - 1; d++) {
      const level = this.levels[d]!;
      const isRight = i % 2 === 1;
      const sib = isRight ? level[i - 1] : level[i + 1];
      if (sib !== undefined) steps.push({ hash: sib, left: isRight });
      i = Math.floor(i / 2);
    }
    return steps;
  }
}

export function verifyProof(leafHex: string, proof: MerkleProofStep[], rootHex: string): boolean {
  let h = hashLeaf(leafHex);
  for (const s of proof) h = s.left ? hashNode(s.hash, h) : hashNode(h, s.hash);
  return h === rootHex;
}

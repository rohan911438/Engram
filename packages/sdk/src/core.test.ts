import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canonical, decrypt, encrypt, generateKeyPair, newDataKey, sign, verifySignature } from "./crypto.js";
import { EMPTY_ROOT, MerkleTree, verifyProof } from "./merkle.js";
import { Engram } from "./engram.js";
import { InMemoryRemote } from "./remote.js";
import { sha256Hex } from "./crypto.js";

describe("canonical JSON", () => {
  it("sorts keys at every depth and drops undefined", () => {
    expect(canonical({ b: 1, a: { d: [{ z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[{"y":2,"z":1}]},"b":1}');
  });
});

describe("ed25519", () => {
  it("signs and verifies; rejects tampering and garbage", () => {
    const kp = generateKeyPair();
    const sig = sign("hello", kp.secretKey);
    expect(verifySignature("hello", sig, kp.publicKey)).toBe(true);
    expect(verifySignature("hellO", sig, kp.publicKey)).toBe(false);
    expect(verifySignature("hello", sig, generateKeyPair().publicKey)).toBe(false);
    expect(verifySignature("hello", "zz", kp.publicKey)).toBe(false);
  });
});

describe("aes-256-gcm", () => {
  it("round-trips and rejects wrong key / aad / tampered ciphertext", () => {
    const key = newDataKey();
    const s = encrypt(Buffer.from("secret"), key, "ep_1");
    expect(decrypt(s, key, "ep_1").toString()).toBe("secret");
    expect(() => decrypt(s, newDataKey(), "ep_1")).toThrow();
    expect(() => decrypt(s, key, "ep_2")).toThrow();
    const ct = Buffer.from(s.ct, "base64");
    ct[0]! ^= 1;
    expect(() => decrypt({ ...s, ct: ct.toString("base64") }, key, "ep_1")).toThrow();
  });
});

describe("merkle", () => {
  const leaves = (n: number) => Array.from({ length: n }, (_, i) => sha256Hex(`leaf${i}`));

  it("empty tree has a fixed root", () => {
    expect(new MerkleTree([]).root).toBe(EMPTY_ROOT);
  });

  it.each([1, 2, 3, 4, 5, 7, 8, 13])("every proof verifies for %i leaves", (n) => {
    const ls = leaves(n);
    const t = new MerkleTree(ls);
    ls.forEach((l, i) => expect(verifyProof(l, t.proof(i), t.root)).toBe(true));
  });

  it("rejects wrong leaf, wrong root and swapped leaves", () => {
    const ls = leaves(5);
    const t = new MerkleTree(ls);
    expect(verifyProof(ls[1]!, t.proof(0), t.root)).toBe(false);
    expect(verifyProof(ls[0]!, t.proof(0), sha256Hex("x"))).toBe(false);
    expect(new MerkleTree([ls[1]!, ls[0]!]).root).not.toBe(new MerkleTree([ls[0]!, ls[1]!]).root);
  });

  it("a one-leaf tree's root is not the raw leaf (domain separation)", () => {
    const [l] = leaves(1);
    expect(new MerkleTree([l!]).root).not.toBe(l);
  });
});

describe("Engram episodes", () => {
  let dir: string;
  let remote: InMemoryRemote;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "engram-"));
    remote = new InMemoryRemote();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("init creates a repo that open() can load; refuses double init and bad names", () => {
    const e = Engram.init("money-ops", { dir, remote });
    expect(Engram.open({ dir, remote }).publicKey).toBe(e.publicKey);
    expect(() => Engram.init("money-ops", { dir, remote })).toThrow(/already exists/);
    expect(() => Engram.init("Bad Name", { dir: join(dir, "x"), remote })).toThrow();
  });

  it("observe stores only ciphertext and read() decrypts it", () => {
    const e = Engram.init("t", { dir, remote });
    const ep = e.observe({ source: "tatum", data: { amount: 450, to: "0x7a" }, summary: "transfer" });
    const onDisk = readFileSync(join(dir, ".engram", "objects", "episodes", `${ep.id}.json`), "utf8");
    expect(onDisk).not.toContain("0x7a");
    expect(e.read(ep.id)).toEqual({ source: "tatum", ts: ep.ts, data: { amount: 450, to: "0x7a" } });
  });

  it("detects a tampered envelope", () => {
    const e = Engram.init("t", { dir, remote });
    const ep = e.observe({ source: "user", data: "hi" });
    e.store.put("episodes", ep.id, { ...ep, envelope: { ...ep.envelope, iv: Buffer.alloc(12).toString("base64") } });
    expect(() => e.read(ep.id)).toThrow();
  });

  it("push uploads pending episodes once and records blob IDs", async () => {
    const e = Engram.init("t", { dir, remote });
    e.observe({ source: "user", data: 1 });
    e.observe({ source: "user", data: 2 });
    expect((await e.push()).episodes).toBe(2);
    expect((await e.push()).episodes).toBe(0);
    expect(e.episodes().every((x) => x.blobId)).toBe(true);
    expect(remote.items).toHaveLength(2);
    expect(remote.items[0]!.namespace).toBe("engram-t-episodes");
    expect(remote.items[0]!.text).not.toContain('"data"');
  });

  it("destroying a key makes the episode unreadable", () => {
    const e = Engram.init("t", { dir, remote });
    const ep = e.observe({ source: "user", data: "private" });
    expect(e.vault.destroy(ep.keyId)).toBe(true);
    expect(e.read(ep.id)).toBeNull();
    expect(e.vault.destroy(ep.keyId)).toBe(false);
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WalletAuth } from "./auth.js";
import { LinkService } from "./links.js";
import { Signer, serverSigner } from "./secret.js";

const WALLET = `0x${"ab".repeat(32)}`;
const PUBKEY = "cd".repeat(32);
const dirs: string[] = [];
const fresh = () => {
  const d = mkdtempSync(join(tmpdir(), "engram-restart-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Links an agent and returns its token, like `engram link` + approving in the browser. */
function link(links: LinkService) {
  const start = links.start({ agent: "my-agent", agentPubKey: PUBKEY, label: "My agent" }, "https://example.test");
  links.decide(start.code, WALLET, true);
  return links.poll(start.device).token!;
}

describe("surviving a restart on a wiped disk", () => {
  const key = Buffer.alloc(32, 7);

  it("signer rejects tampered or foreign tokens", () => {
    const s = new Signer(key);
    const t = s.sign("x_", { a: 1 });
    expect(s.open("x_", t)).toEqual({ a: 1 });
    expect(s.open("x_", t.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBeNull();
    expect(new Signer(Buffer.alloc(32, 8)).open("x_", t)).toBeNull();
    expect(s.open("y_", t)).toBeNull();
  });

  it("link tokens still work and the agent is listed again", () => {
    const token = link(new LinkService(fresh(), undefined, new Signer(key)));
    const after = new LinkService(fresh(), undefined, new Signer(key)); // new process, empty disk
    expect(after.list(WALLET)).toHaveLength(0);
    const rec = after.authenticate(`Bearer ${token}`);
    expect(rec).toMatchObject({ wallet: WALLET, agent: "my-agent", agentPubKey: PUBKEY, label: "My agent" });
    expect(after.list(WALLET).map((a) => a.agent)).toEqual(["my-agent"]);
  });

  it("refuses link tokens from another key, and unlinked ones", () => {
    const links = new LinkService(fresh(), undefined, new Signer(key));
    const token = link(links);
    expect(() => new LinkService(fresh(), undefined, new Signer(Buffer.alloc(32, 9))).authenticate(`Bearer ${token}`)).toThrow(/invalid or revoked/);
    links.unlink(WALLET, PUBKEY.slice(0, 16));
    expect(() => links.authenticate(`Bearer ${token}`)).toThrow(/invalid or revoked/);
  });

  it("without a signer, tokens are only valid while on file (old behaviour)", () => {
    const token = link(new LinkService(fresh()));
    expect(() => new LinkService(fresh()).authenticate(`Bearer ${token}`)).toThrow(/invalid or revoked/);
  });

  it("sign-in sessions survive a restart, end on logout and expiry", () => {
    let now = 1_000;
    const mk = () => new WalletAuth({ signer: new Signer(key), now: () => now, sessionMs: 10_000 });
    const a = mk();
    // Skip the wallet signature: sign the session token the way verify() does.
    const token = new Signer(key).sign("s1_", { a: WALLET, e: now + 10_000, n: "x" });
    expect(mk().session(token)).toBe(WALLET);
    a.logout(token);
    expect(a.session(token)).toBeNull();
    now += 20_000;
    expect(mk().session(token)).toBeNull();
    expect(mk().session("s1_garbage.sig")).toBeNull();
  });

  it("derives a stable key from existing secrets when ENGRAM_SECRET is unset", () => {
    expect(serverSigner({ ENGRAM_SECRET: "x" }).source).toBe("ENGRAM_SECRET");
    const one = serverSigner({ MEMWAL_KEY: "suiprivkey1abc" });
    const two = serverSigner({ MEMWAL_KEY: "suiprivkey1abc" });
    expect(one.source).toBe("derived");
    expect(two.signer.open("p_", one.signer.sign("p_", { ok: true }))).toEqual({ ok: true });
    expect(serverSigner({}).source).toBe("random");
  });
});

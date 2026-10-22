import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Engram, importAudit, verifyAudit, type Anchorer, type AuditBundle, type RemoteHit, type RemoteMemory } from "@rohankumar4179/engram-sdk";

/**
 * Links local agents (CLI / SDK) to a wallet's dashboard.
 *
 *   agent  → POST /api/link/start            { code, device, url }
 *   owner  → opens /link?code=…, signs in with the wallet, approves
 *   agent  → GET  /api/link/poll?device=…    { status: "approved", token }
 *   agent  → POST /api/link/sync  (Bearer)   audit bundle → verified → stored
 *
 * A token is bound to one wallet and one agent key: a bundle signed by any
 * other key is refused, and history can only grow (no rewriting old commits).
 */

interface Pending {
  code: string;
  device: string;
  agent: string;
  agentPubKey: string;
  label: string;
  expiresAt: number;
  status: "pending" | "approved" | "denied";
  wallet?: string;
  token?: string;
}

interface TokenRecord {
  wallet: string;
  agent: string;
  agentPubKey: string;
  label: string;
  createdAt: number;
}

export interface LinkedAgent {
  id: string;
  agent: string;
  label: string;
  agentPubKey: string;
  head: string | null;
  headMessage: string | null;
  commits: number;
  beliefs: number;
  receipts: number;
  linkedAt: number;
  syncedAt: number | null;
  anchored: number;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const AGENT_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

/** Linked agents' manifests live in their owner's Walrus Memory account — not readable here. */
class OwnerOnlyRemote implements RemoteMemory {
  async putMany(): Promise<string[]> {
    throw new Error("linked agents are read-only here");
  }
  async search(): Promise<RemoteHit[]> {
    throw new Error("the manifest is in the owner's own Walrus Memory account (checked by the agent itself)");
  }
}

export class LinkService {
  private pending = new Map<string, Pending>(); // by device
  private byCode = new Map<string, string>(); // code → device
  private tokensPath: string;
  private tokens: Record<string, TokenRecord>; // sha256(token) → record
  private engrams = new Map<string, { mtime: number; engram: Engram }>();

  constructor(
    private dataDir: string,
    private anchorer?: Anchorer,
  ) {
    mkdirSync(dataDir, { recursive: true });
    this.tokensPath = join(dataDir, "links.json");
    this.tokens = existsSync(this.tokensPath) ? (JSON.parse(readFileSync(this.tokensPath, "utf8")) as Record<string, TokenRecord>) : {};
  }

  private saveTokens() {
    writeFileSync(this.tokensPath, JSON.stringify(this.tokens, null, 2), { mode: 0o600 });
  }

  private sweep(now = Date.now()) {
    for (const [device, p] of this.pending) {
      if (p.expiresAt < now - 60_000) {
        this.pending.delete(device);
        this.byCode.delete(p.code);
      }
    }
  }

  start(input: { agent?: string; agentPubKey?: string; label?: string }, baseUrl: string): { code: string; device: string; url: string; expiresAt: number } {
    const agent = String(input.agent ?? "");
    const agentPubKey = String(input.agentPubKey ?? "").toLowerCase();
    if (!AGENT_RE.test(agent)) throw new Error("invalid agent name");
    if (!/^[0-9a-f]{64}$/.test(agentPubKey)) throw new Error("invalid agent public key");
    this.sweep();
    if (this.pending.size > 5000) throw new Error("too many pending link requests — try again shortly");
    const bytes = randomBytes(8);
    const raw = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
    const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    const device = randomBytes(24).toString("hex");
    const p: Pending = { code, device, agent, agentPubKey, label: String(input.label ?? agent).slice(0, 60), expiresAt: Date.now() + 10 * 60_000, status: "pending" };
    this.pending.set(device, p);
    this.byCode.set(code, device);
    return { code, device, url: `${baseUrl.replace(/\/+$/, "")}/link?code=${code}`, expiresAt: p.expiresAt };
  }

  private byCodeLive(code: string): Pending {
    const device = this.byCode.get(String(code).toUpperCase().trim());
    const p = device ? this.pending.get(device) : undefined;
    if (!p || p.expiresAt < Date.now()) throw new Error("this link code is unknown or expired — run link again");
    return p;
  }

  info(code: string) {
    const p = this.byCodeLive(code);
    return { agent: p.agent, label: p.label, agentPubKey: p.agentPubKey, expiresAt: p.expiresAt, status: p.status };
  }

  decide(code: string, wallet: string, approve: boolean) {
    const p = this.byCodeLive(code);
    if (p.status !== "pending") throw new Error(`this code was already ${p.status}`);
    if (!approve) {
      p.status = "denied";
      return { status: p.status };
    }
    const token = `eng_${randomBytes(32).toString("base64url")}`;
    this.tokens[sha(token)] = { wallet, agent: p.agent, agentPubKey: p.agentPubKey, label: p.label, createdAt: Date.now() };
    this.saveTokens();
    p.status = "approved";
    p.wallet = wallet;
    p.token = token;
    return { status: p.status };
  }

  /** The device collects its token once; after that the pending entry is gone. */
  poll(device: string): { status: string; token?: string; wallet?: string } {
    const p = this.pending.get(String(device));
    if (!p) return { status: "expired" };
    if (p.status === "approved") {
      this.pending.delete(device);
      this.byCode.delete(p.code);
      return { status: "approved", token: p.token, wallet: p.wallet };
    }
    if (p.status === "denied" || p.expiresAt < Date.now()) {
      this.pending.delete(device);
      this.byCode.delete(p.code);
      return { status: p.status === "denied" ? "denied" : "expired" };
    }
    return { status: "pending" };
  }

  authenticate(header: string | undefined): TokenRecord & { tokenHash: string } {
    const token = /^Bearer\s+(\S+)$/i.exec(header ?? "")?.[1];
    const rec = token ? this.tokens[sha(token)] : undefined;
    if (!token || !rec) throw Object.assign(new Error("invalid or revoked link token — run `engram link` again"), { status: 401 });
    return { ...rec, tokenHash: sha(token) };
  }

  private dir(wallet: string, id: string) {
    if (!/^[0-9a-f]{16}$/.test(id)) throw new Error("invalid agent id");
    return join(this.dataDir, "wallets", wallet, "linked", id);
  }

  /** Verifies the bundle and stores it. Refuses other agents' keys and history rewrites. */
  async sync(rec: TokenRecord, bundle: AuditBundle) {
    if (bundle?.engram !== "audit") throw new Error("expected an Engram audit bundle");
    if (bundle.agentPubKey !== rec.agentPubKey) throw new Error("this token was issued for a different agent key");
    if (bundle.agent !== rec.agent) throw new Error("agent name differs from the linked agent");
    const id = rec.agentPubKey.slice(0, 16);
    const dir = this.dir(rec.wallet, id);
    const prevPath = join(dir, "bundle.json");
    if (existsSync(prevPath)) {
      const prev = JSON.parse(readFileSync(prevPath, "utf8")) as AuditBundle;
      if (prev.head && !bundle.commits.some((c) => c.id === prev.head)) throw new Error(`history rewrite refused: the new bundle doesn't contain the previously synced commit ${prev.head.slice(0, 8)}`);
    }
    const report = await verifyAudit(bundle, { anchorer: this.anchorer });
    if (!report.ok) {
      const bad = report.checks.filter((c) => !c.ok).slice(0, 3).map((c) => `${c.subject}: ${c.detail}`);
      throw new Error(`bundle failed verification — ${bad.join("; ")}`);
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(prevPath, JSON.stringify(bundle));
    importAudit(bundle, dir);
    writeFileSync(join(dir, "meta.json"), JSON.stringify({ label: rec.label, linkedAt: rec.createdAt, syncedAt: Date.now(), anchored: report.summary.anchored }));
    this.engrams.delete(`${rec.wallet}/${id}`);
    return { agentId: id, commits: report.summary.commits, receipts: report.summary.receipts, anchored: report.summary.anchored };
  }

  list(wallet: string): LinkedAgent[] {
    const out = new Map<string, LinkedAgent>();
    // Linked but never synced yet.
    for (const r of Object.values(this.tokens)) {
      if (r.wallet !== wallet) continue;
      const id = r.agentPubKey.slice(0, 16);
      out.set(id, { id, agent: r.agent, label: r.label, agentPubKey: r.agentPubKey, head: null, headMessage: null, commits: 0, beliefs: 0, receipts: 0, linkedAt: r.createdAt, syncedAt: null, anchored: 0 });
    }
    const root = join(this.dataDir, "wallets", wallet, "linked");
    if (existsSync(root)) {
      for (const id of readdirSync(root)) {
        const bundlePath = join(root, id, "bundle.json");
        if (!existsSync(bundlePath) || !out.has(id)) continue;
        const b = JSON.parse(readFileSync(bundlePath, "utf8")) as AuditBundle;
        const meta = JSON.parse(readFileSync(join(root, id, "meta.json"), "utf8")) as { label: string; linkedAt: number; syncedAt: number; anchored: number };
        const head = b.commits[0];
        const active = head ? head.manifest.beliefs.length : 0;
        out.set(id, { ...out.get(id)!, head: b.head, headMessage: head?.manifest.message ?? null, commits: b.commits.length, beliefs: active, receipts: b.receipts.length, syncedAt: meta.syncedAt, anchored: meta.anchored });
      }
    }
    return [...out.values()].sort((a, b) => (b.syncedAt ?? b.linkedAt) - (a.syncedAt ?? a.linkedAt));
  }

  /** Read-only Engram for a linked agent, rebuilt from its last verified bundle. */
  engram(wallet: string, id: string): Engram {
    const dir = this.dir(wallet, id);
    const bundlePath = join(dir, "bundle.json");
    if (!existsSync(bundlePath)) throw Object.assign(new Error("this agent hasn't synced yet — run `engram sync`"), { status: 404 });
    const key = `${wallet}/${id}`;
    const mtime = statSync(bundlePath).mtimeMs;
    const cached = this.engrams.get(key);
    if (cached && cached.mtime === mtime) return cached.engram;
    const engram = Engram.open({ dir, remote: new OwnerOnlyRemote(), anchorer: this.anchorer, readOnly: true });
    this.engrams.set(key, { mtime, engram });
    return engram;
  }

  /** Revokes every token for this agent and deletes its synced copy. */
  unlink(wallet: string, id: string): boolean {
    let found = false;
    for (const [h, r] of Object.entries(this.tokens)) {
      if (r.wallet === wallet && r.agentPubKey.startsWith(id)) {
        delete this.tokens[h];
        found = true;
      }
    }
    this.saveTokens();
    rmSync(this.dir(wallet, id), { recursive: true, force: true });
    this.engrams.delete(`${wallet}/${id}`);
    return found;
  }
}

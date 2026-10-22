import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { NothingToCommitError, beliefKey, type Belief, type Engram, type LLM, type VerifyReport } from "@rohankumar4179/engram-sdk";

/**
 * `engram mcp` — Engram's git-style memory tools for MCP clients (Claude Code,
 * Cursor, Claude Desktop…). Walrus Memory already has a plain memory MCP; this
 * one adds what Engram is for: beliefs with evidence, commits, history,
 * provable forgetting and proof checks.
 *
 *   { "mcpServers": { "engram": { "command": "npx", "args": ["engram", "mcp", "-C", "/path/to/project"] } } }
 */
export function createMcpServer(e: Engram, llm: () => LLM, version: string): McpServer {
  const server = new McpServer({ name: "engram", version });
  const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
  const fail = (err: unknown) => ({ ...text(`error: ${(err as Error).message}`), isError: true });
  const line = (b: Belief) => `${beliefKey(b)} (${b.confidence.toFixed(2)}${b.status === "retracted" ? ", retracted" : ""}): ${b.statement}`;
  const report = (title: string, r: VerifyReport) =>
    [`${title}: ${r.ok ? "VALID" : "INVALID"}`, ...r.checks.map((c) => `${c.skipped ? "–" : c.ok ? "✔" : "✘"} ${c.name}: ${c.detail}`)].join("\n");
  const safe =
    <A,>(fn: (a: A) => Promise<string> | string) =>
    async (a: A) => {
      try {
        return text(await fn(a));
      } catch (err) {
        return fail(err);
      }
    };

  server.registerTool(
    "engram_status",
    { title: "Memory status", description: "The agent's memory at a glance: HEAD commit, beliefs, episodes waiting to be consolidated.", inputSchema: {} },
    safe(() => {
      const head = e.head();
      const c = head ? e.getCommit(head) : null;
      return [
        `agent ${e.agent}`,
        `HEAD ${head ? `${head.slice(0, 8)} "${c!.manifest.message}"${c!.anchor ? ` (anchored, checkpoint ${c!.anchor.checkpoint})` : ""}` : "none — nothing committed yet"}`,
        `${e.beliefs().length} active beliefs, ${e.episodes().length} episodes (${e.pendingEpisodes().length} not consolidated yet)`,
      ].join("\n");
    }),
  );

  server.registerTool(
    "engram_remember",
    {
      title: "Remember",
      description: "Record something as an episode (encrypted with its own key). It becomes a belief after engram_sleep.",
      inputSchema: { text: z.string().min(1).max(4000), source: z.enum(["user", "agent", "tool"]).default("user").describe("who said or saw it") },
    },
    safe(({ text: t, source }: { text: string; source: "user" | "agent" | "tool" }) => {
      const ep = e.observe({ source, data: t, summary: t.slice(0, 60) });
      return `recorded ${ep.id}. Run engram_sleep to turn new episodes into beliefs.`;
    }),
  );

  server.registerTool(
    "engram_beliefs",
    {
      title: "Beliefs",
      description: "What the agent currently believes — optionally only what's relevant to a topic, or as it was at a past commit or date.",
      inputSchema: {
        about: z.string().optional().describe("topic to search for"),
        at: z.string().optional().describe("commit id, HEAD~n, or date YYYY-MM-DD"),
        limit: z.number().int().min(1).max(50).default(10),
      },
    },
    safe(async ({ about, at, limit }: { about?: string; at?: string; limit: number }) => {
      const list = at ? e.beliefsAt(at) : about ? await e.relevant(about, limit) : e.beliefs();
      return list.length ? list.slice(0, limit).map(line).join("\n") : "no beliefs";
    }),
  );

  server.registerTool(
    "engram_sleep",
    { title: "Consolidate", description: "Turn new episodes into beliefs (create, revise or retract), each citing its evidence.", inputSchema: { context: z.string().optional().describe("domain hint") } },
    safe(async ({ context }: { context?: string }) => {
      const r = await e.sleep({ llm: llm(), context });
      return [
        `${r.episodes} episodes → ${r.created.length} new, ${r.revised.length} revised, ${r.retracted.length} retracted`,
        ...r.created.map((b) => `+ ${line(b)}`),
        ...r.revised.map((b) => `~ ${line(b)}`),
        ...r.retracted.map((b) => `- ${b.id} ${b.reason ?? ""}`),
      ].join("\n");
    }),
  );

  server.registerTool(
    "engram_commit",
    { title: "Commit", description: "Checkpoint the memory: Merkle root over all beliefs, signed, stored on Walrus, anchored on Sui.", inputSchema: { message: z.string().min(1).max(200) } },
    safe(async ({ message }: { message: string }) => {
      try {
        const c = await e.commit(message);
        return `commit ${c.id.slice(0, 8)} — ${c.manifest.beliefs.length} beliefs, root ${c.manifest.merkleRoot.slice(0, 12)}…${c.anchor ? `, anchored on Sui (tx ${c.anchor.txDigest})` : ""}`;
      } catch (err) {
        if (err instanceof NothingToCommitError) return "nothing to commit — beliefs unchanged";
        throw err;
      }
    }),
  );

  server.registerTool(
    "engram_log",
    { title: "History", description: "Commit history, newest first.", inputSchema: { limit: z.number().int().min(1).max(100).default(10) } },
    safe(({ limit }: { limit: number }) =>
      e.head()
        ? e
            .log()
            .slice(0, limit)
            .map((c) => `${c.id.slice(0, 8)} ${new Date(c.manifest.ts).toISOString().slice(0, 16)} "${c.manifest.message}" — ${c.manifest.beliefs.length} beliefs${c.anchor ? " · anchored" : ""}`)
            .join("\n")
        : "no commits yet",
    ),
  );

  server.registerTool(
    "engram_diff",
    { title: "What changed", description: "Beliefs added, revised and dropped between two commits or dates.", inputSchema: { from: z.string(), to: z.string().optional().describe("default HEAD") } },
    safe(({ from, to }: { from: string; to?: string }) => {
      const d = e.diff(from, to);
      const out = [...d.added.map((b) => `+ ${line(b)}`), ...d.changed.map(([a, b]) => `~ ${a.statement}\n  → ${line(b)}`), ...d.removed.map((b) => `- ${line(b)}`)];
      return out.length ? out.join("\n") : "no changes";
    }),
  );

  server.registerTool(
    "engram_blame",
    { title: "Why", description: "Why the agent believes something: version history and the evidence episodes (with Walrus blob IDs).", inputSchema: { belief: z.string().describe("belief id, e.g. b_rent or b_rent@2") } },
    safe(({ belief }: { belief: string }) => {
      const r = e.blame(belief);
      return [
        line(r.belief),
        r.belief.reason ? `why: ${r.belief.reason}` : "",
        ...r.evidence.map((x) => `← ${x.episode.id} ${new Date(x.episode.ts).toISOString().slice(0, 10)} ${x.content === null ? "[forgotten]" : typeof x.content.data === "string" ? x.content.data : JSON.stringify(x.content.data).slice(0, 200)}${x.episode.blobId ? ` (blob ${x.episode.blobId})` : ""}`),
        r.history.length > 1 ? `versions: ${r.history.map((h) => `v${h.version}`).join(" → ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }),
  );

  server.registerTool(
    "engram_forget",
    {
      title: "Forget",
      description: "Crypto-shred an episode: its key is destroyed so it can never be read again; beliefs that relied on it are retracted or revised. Irreversible.",
      inputSchema: { episode: z.string().regex(/^ep_[0-9a-f]+$/), reason: z.string().default("forgotten on request") },
      annotations: { destructiveHint: true },
    },
    safe(({ episode, reason }: { episode: string; reason: string }) => {
      const r = e.forget(episode, reason);
      return [`key for ${episode} destroyed`, ...r.retracted.map((b) => `- retracted ${b.id}`), ...r.revised.map((b) => `~ revised ${line(b)}`), "commit to record the tombstone on Walrus + Sui"].join("\n");
    }),
  );

  server.registerTool(
    "engram_verify",
    {
      title: "Verify",
      description: "Proof check for a decision receipt (r_…) or a commit: signatures, Merkle proofs, the manifest on Walrus, the anchor on Sui.",
      inputSchema: { ref: z.string().default("HEAD"), offline: z.boolean().default(false) },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ ref, offline }: { ref: string; offline: boolean }) => {
      const o = offline ? { walrus: false, chain: false } : {};
      return ref.startsWith("r_") ? report(`receipt ${ref}`, await e.verifyReceipt(ref, o)) : report(`commit ${e.resolve(ref).slice(0, 8)}`, await e.verifyCommit(ref, o));
    }),
  );

  return server;
}

export async function runMcp(e: Engram, llm: () => LLM, version: string): Promise<void> {
  // stdout belongs to the protocol — anything chatty must go to stderr.
  console.log = console.error;
  await createMcpServer(e, llm, version).connect(new StdioServerTransport());
}

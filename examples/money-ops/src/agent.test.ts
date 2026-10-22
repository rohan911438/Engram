import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe as group, expect, it } from "vitest";
import { Engram, FakeAnchorer, InMemoryRemote, ScriptedLLM, type TatumSui } from "@rohankumar4179/engram-sdk";
import { MoneyOpsAgent } from "./agent.js";
import { WalletFeed, describe, type WalletEvent } from "./feed.js";

const ev = (digest: string, amount: number, counterparty: string, kind: WalletEvent["kind"] = "transfer"): WalletEvent => ({
  digest, ts: Date.parse("2026-08-01T09:00:00Z"), direction: "out", coin: "USDC", amount, counterparty, kind,
});

let dir: string;
let e: Engram;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "moneyops-"));
  e = Engram.init("money-ops", { dir, remote: new InMemoryRemote(), anchorer: new FakeAnchorer() });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

group("MoneyOpsAgent", () => {
  it("judges a batch with one LLM call, records episodes, and writes receipts once committed", async () => {
    const llm = new ScriptedLLM([
      { decisions: [{ digest: "d1", alert: true, severity: "info", message: "still learning", used: [] }] },
      { decisions: [
        { digest: "d2", alert: false, severity: "info", message: "rent", used: ["b_rent", "b_fake"] },
        { digest: "d3", alert: true, severity: "critical", message: "unknown", used: [] },
      ] },
    ]);
    const agent = new MoneyOpsAgent(e, llm);
    const first = await agent.handleMany([ev("d1", 450, "0xlandlord")]);
    expect(first[0]!.receipt).toBeNull(); // nothing committed yet
    expect(llm.calls[0]!.prompt).toContain("(none yet)");

    const ep = e.episodes()[0]!;
    e.applyOp({ op: "create", key: "rent", statement: "Rent 450 to 0xlandlord", confidence: 0.9, evidence: [ep.id], tags: ["rent"], reason: "t" });
    await e.commit("c1");

    const out = await agent.handleMany([ev("d2", 450, "0xlandlord"), ev("d3", 1800, "0xstranger"), ev("d4", 0.002, "", "gas_only")]);
    expect(llm.calls).toHaveLength(2); // one call for the whole batch; gas isn't sent to the LLM
    expect(llm.calls[1]!.prompt).toContain("b_rent");
    expect(llm.calls[1]!.prompt).not.toContain('"d4"');
    expect(out.map((h) => h.assessment.alert)).toEqual([false, true, false]);
    expect(out[0]!.receipt!.beliefs).toEqual(["b_rent@1"]);
    expect(out[0]!.receipt!.action).toContain("no alert");
    expect(out[1]!.receipt!.action).toContain("ALERT[critical]");
    expect((await e.verifyReceipt(out[0]!.receipt!.id)).ok).toBe(true);
    expect(e.episodes()).toHaveLength(4);
  });

  it("alerts safely when the model skips an event", async () => {
    const agent = new MoneyOpsAgent(e, new ScriptedLLM([{ decisions: [] }]));
    const [h] = await agent.handleMany([ev("d1", 5, "0xa")]);
    expect(h!.assessment.alert).toBe(true);
  });
});

group("WalletFeed", () => {
  const me = "0xme";
  const tatum = {
    coinMetadata: async (coinType: string) => (coinType.endsWith("::usdc::USDC") ? { decimals: 6, symbol: "USDC" } : { decimals: 9, symbol: "SUI" }),
  } as unknown as TatumSui;
  const feed = new WalletFeed(tatum, me);

  it("parses an outgoing USDC transfer with its counterparty", async () => {
    const [x] = await feed.toEvents({
      digest: "D", timestampMs: "1000", transaction: { data: { sender: me } },
      balanceChanges: [
        { owner: { AddressOwner: me }, coinType: "0x2::usdc::USDC", amount: "-450000000" },
        { owner: { AddressOwner: "0xlandlord" }, coinType: "0x2::usdc::USDC", amount: "450000000" },
      ],
    });
    expect(x).toMatchObject({ direction: "out", coin: "USDC", amount: 450, counterparty: "0xlandlord", kind: "transfer" });
    expect(describe(x!)).toBe("sent 450 USDC to 0xlandlo…");
  });

  it("reports the amount received, not our debit including gas", async () => {
    const [x] = await feed.toEvents({
      digest: "R", transaction: { data: { sender: me } },
      balanceChanges: [
        { owner: { AddressOwner: me }, coinType: "0x2::sui::SUI", amount: "-46500000" },
        { owner: { AddressOwner: "0xlandlord" }, coinType: "0x2::sui::SUI", amount: "45000000" },
      ],
    });
    expect(x).toMatchObject({ direction: "out", coin: "SUI", amount: 0.045, counterparty: "0xlandlord" });
  });

  it("labels gas-only and swaps", async () => {
    const gas = await feed.toEvents({ digest: "G", transaction: { data: { sender: me } }, balanceChanges: [{ owner: { AddressOwner: me }, coinType: "0x2::sui::SUI", amount: "-100398" }] });
    expect(gas[0]).toMatchObject({ kind: "gas_only", amount: 0.000100398 });
    const swap = await feed.toEvents({ digest: "S", transaction: { data: { sender: me } }, balanceChanges: [
      { owner: { AddressOwner: me }, coinType: "0x2::usdc::USDC", amount: "-100000000" },
      { owner: { AddressOwner: me }, coinType: "0x2::sui::SUI", amount: "30000000000" },
    ] });
    expect(swap.map((s) => `${s.direction}:${s.coin}:${s.amount}:${s.kind}`)).toEqual(["out:USDC:100:swap", "in:SUI:30:swap"]);
  });
});

group("WalletFeed swap counterparty", () => {
  it("has no counterparty for swaps, even when the sender is us", async () => {
    const tatum = { coinMetadata: async () => ({ decimals: 6, symbol: "USDC" }) } as unknown as TatumSui;
    const feed = new WalletFeed(tatum, "0xme");
    const out = await feed.toEvents({ digest: "S", transaction: { data: { sender: "0xme" } }, balanceChanges: [
      { owner: { AddressOwner: "0xme" }, coinType: "a::usdc::USDC", amount: "-1" },
      { owner: { AddressOwner: "0xme" }, coinType: "b::x::X", amount: "5" },
    ] });
    expect(out.every((x) => x.counterparty === null)).toBe(true);
  });
});

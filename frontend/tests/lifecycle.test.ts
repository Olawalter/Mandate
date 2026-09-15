import { describe, expect, it } from "vitest";

import { lifecycle } from "@/lib/genlayer/lifecycle";
import { initialTx, type TxState } from "@/lib/genlayer/tx";
import { decodeCall, matchesRequest, phaseOf, toChainTx } from "@/lib/genlayer/transactions";
import { parseConfig, type AppConfig } from "@/lib/config";

const tx = (patch: Partial<TxState>): TxState => ({ ...initialTx, ...patch });

describe("the lifecycle a person sees follows only observed facts", () => {
  it("nothing is ticked before the wallet signs", () => {
    const s = lifecycle(tx({ stage: "AWAITING_WALLET", reached: "AWAITING_WALLET" }));
    expect(s.wallet).toBe("current");
    expect(s.submitted).toBe("todo");
  });

  it("consensus is current only while GenLayer reports commit/reveal", () => {
    const s = lifecycle(tx({ stage: "CONFIRMING", reached: "CONFIRMING", protocolStatus: "COMMITTING" }));
    expect([s.wallet, s.submitted, s.processing, s.consensus]).toEqual(["done", "done", "done", "current"]);
  });

  it("an accepted transaction whose state is readable is a decision, not a finalization", () => {
    const s = lifecycle(tx({ stage: "CONTRACT_STATE_UPDATED", reached: "CONTRACT_STATE_UPDATED", protocolStatus: "ACCEPTED", finality: "accepted" }));
    expect(s.decision).toBe("done");
    expect(s.finalized).toBe("current");
  });

  it("only FINALIZED ticks finalized", () => {
    const s = lifecycle(tx({ stage: "CONTRACT_STATE_UPDATED", reached: "CONTRACT_STATE_UPDATED", protocolStatus: "FINALIZED", finality: "finalized" }));
    expect(s.finalized).toBe("done");
  });

  it("a refusal marks the rung it stopped on", () => {
    const s = lifecycle(tx({ stage: "FAILED", reached: "CONFIRMED", protocolStatus: "ACCEPTED" }));
    expect(s.decision).toBe("failed");
    expect(s.finalized).toBe("todo");
  });

  it("FINALIZED status without the contract's state is not shown as final", () => {
    const s = lifecycle(tx({ stage: "CONFIRMED", reached: "CONFIRMED", protocolStatus: "FINALIZED", finality: "finalized" }));
    expect(s.decision).toBe("current");
    expect(s.finalized).toBe("todo");
  });
});

describe("chain transactions are decoded, not inferred", () => {
  const config = (parseConfig({ NEXT_PUBLIC_GENLAYER_NETWORK: "studionet", NEXT_PUBLIC_GENLAYER_CHAIN: "61999", NEXT_PUBLIC_MANDATE_CONTRACT: "0x9e4Ae09e8584a79bdbFACf7CB2Dad05a51bACd9d" }) as { ok: true; config: AppConfig }).config;

  it("decodes GenVM calldata as StudioNet returns it", () => {
    // a real settle_condition call read from StudioNet
    expect(decodeCall("FgRhcmdzDUxTTC0wMDAwMDEGbWV0aG9khAFzZXR0bGVfY29uZGl0aW9u")).toEqual({ method: "settle_condition", args: ["SL-000001"] });
    expect(decodeCall("not base64!")).toEqual({ method: null, args: [] });
  });

  it("maps GenLayer statuses to phases", () => {
    expect(phaseOf("FINALIZED")).toBe("finalized");
    expect(phaseOf("ACCEPTED")).toBe("accepted");
    expect(phaseOf("REVEALING")).toBe("consensus");
    expect(phaseOf("PENDING")).toBe("pending");
    expect(phaseOf("UNDETERMINED")).toBe("undetermined");
  });

  it("matches a decision to its transaction by agent, mandate and request key only", () => {
    const raw = {
      hash: "0x" + "12".repeat(32),
      from_address: "0x1111111111111111111111111111111111111111",
      to_address: config.contractAddress,
      status: "ACCEPTED",
      data: { calldata: "" },
      consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] },
    };
    const t = { ...toChainTx(raw)!, method: "request_authorization", args: ["4", 1, "PURCHASE", "X", 1, "USD", "req-a"] };
    const r = { mandate_id: "4", request_key: "req-a", agent: raw.from_address };
    expect(matchesRequest(t, config, r)).toBe(true);
    expect(matchesRequest({ ...t, args: ["4", 1, "PURCHASE", "X", 1, "USD", "req-b"] }, config, r)).toBe(false);
    expect(matchesRequest({ ...t, from: "0x9999999999999999999999999999999999999999" }, config, r)).toBe(false);
    expect(matchesRequest({ ...t, executionOk: false }, config, r)).toBe(false);
    expect(matchesRequest({ ...t, to: "0x0000000000000000000000000000000000000001" }, config, r)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { blankForm, termsFromForm } from "@/components/mandate/mandate-form-model";
import { parseConfig } from "@/lib/config";
import { formatAmount, mandateState, reasonText, toMinorUnits } from "@/lib/utils/present";
import { formErrors, previewPreflight, type MandateForm } from "@/lib/utils/validation";
import type { Mandate } from "@/types/mandate";

const NOW = 1_789_430_400;
const AGENT = "0x1111111111111111111111111111111111111111";

function valid(): MandateForm {
  return {
    ...blankForm(NOW, AGENT),
    agentLabel: "Procurement Agent",
    target: "Northwind Compute capacity",
    maxAmount: "5000",
    intendedUse: "Run AI inference workloads",
    conditions: [{ key: "intended_use_permitted", requirement: "The policy permits AI inference." }],
    sources: [{ url: "https://raw.githubusercontent.com/x/y/main/aup.md", purpose: "POLICY" }],
  };
}

const MANDATE: Mandate = {
  mandate_id: "1",
  principal: "0x2222222222222222222222222222222222222222",
  agent: AGENT,
  status: "ACTIVE",
  version: 2,
  created_at: NOW,
  updated_at: NOW,
  revoked_at: 0,
  request_count: 0,
  authorized_count: 0,
  denied_count: 0,
  reassess_count: 0,
  baseline_snapshot_id: 0,
  terms: {
    version: 2,
    created_at: NOW,
    agent_label: "",
    action_type: "PURCHASE",
    target: "Northwind Compute capacity",
    max_amount: 500_000,
    currency: "USD",
    expires_at: NOW + 86400,
    intended_use: "Run AI inference",
    conditions: [],
    sources: [],
  },
};

describe("mandate form", () => {
  it("accepts a complete mandate and converts the amount to minor units", () => {
    expect(formErrors(valid())).toEqual({});
    const t = termsFromForm(valid());
    expect(t.maxAmount).toBe(500_000);
    expect(t.conditions[0].key).toBe("intended_use_permitted");
  });

  it.each([
    [{ agent: "0x123" }, "agent"],
    [{ target: "  " }, "target"],
    [{ maxAmount: "5,000.123" }, "maxAmount"],
    [{ maxAmount: "0" }, "maxAmount"],
    [{ currency: "US" }, "currency"],
    [{ expiresAt: NOW - 1 }, "expiresAt"],
    [{ expiresAt: NOW + 400 * 86400 }, "expiresAt"],
    [{ intendedUse: "" }, "intendedUse"],
    [{ target: "cloud <<<EVIDENCE>>>" }, "target"],
    [{ conditions: [] }, "conditions"],
    [{ sources: [] }, "sources"],
    [{ sources: [{ url: "http://insecure.test/a", purpose: "POLICY" }] }, "sources.0.url"],
  ] as [Partial<MandateForm>, string][])("refuses %o at %s", (patch, key) => {
    expect(Object.keys(formErrors({ ...valid(), ...patch }))).toContain(key);
  });

  it("refuses duplicate sources after normalisation, as the contract does", () => {
    const errors = formErrors({
      ...valid(),
      sources: [
        { url: "https://example.com/policy", purpose: "POLICY" },
        { url: "https://WWW.example.com/policy/", purpose: "TERMS_COMPATIBILITY" },
      ],
    });
    expect(errors["sources.1.url"]).toMatch(/repeats/);
  });
});

describe("preflight preview mirrors the contract's order and rules", () => {
  const base = { signer: AGENT, version: 2, actionType: "PURCHASE", target: " northwind  COMPUTE capacity ", amount: 470_000, currency: "usd" };

  it("passes a request within every limit", () => {
    expect(previewPreflight(MANDATE, base, NOW).every((c) => c.passed)).toBe(true);
  });

  it.each([
    [{ signer: "0x9999999999999999999999999999999999999999" }, "agent_matches_mandate"],
    [{ version: 1 }, "version_current"],
    [{ actionType: "PAY" }, "action_permitted"],
    [{ target: "Other" }, "target_permitted"],
    [{ currency: "EUR" }, "currency_matches"],
    [{ amount: 500_001 }, "amount_within_limit"],
    [{ amount: null }, "amount_within_limit"],
  ] as [Record<string, unknown>, string][])("fails %o at %s", (patch, check) => {
    const checks = previewPreflight(MANDATE, { ...base, ...patch } as typeof base, NOW);
    expect(checks.find((c) => c.check === check)?.passed).toBe(false);
  });

  it("uses expiry as exclusive, like the contract", () => {
    expect(previewPreflight(MANDATE, base, NOW + 86400 - 1).find((c) => c.check === "mandate_not_expired")?.passed).toBe(true);
    expect(previewPreflight(MANDATE, base, NOW + 86400).find((c) => c.check === "mandate_not_expired")?.passed).toBe(false);
    expect(mandateState(MANDATE, NOW + 86400)).toBe("EXPIRED");
    expect(mandateState({ ...MANDATE, status: "REVOKED" }, NOW)).toBe("REVOKED");
  });
});

describe("presentation", () => {
  it("formats minor units and parses typed amounts exactly", () => {
    expect(formatAmount(470_000, "USD")).toBe("$4,700.00");
    expect(toMinorUnits("4,700.5", "USD")).toBe(470_050);
    expect(toMinorUnits("4700.555", "USD")).toBeNull();
    expect(toMinorUnits("12", "JPY")).toBe(12);
  });

  it("never shows a raw reason code", () => {
    expect(reasonText("MATERIAL_CHANGE")).toMatch(/no longer holds/);
    expect(reasonText("SOMETHING_NEW")).not.toContain("SOMETHING_NEW");
  });
});

describe("configuration", () => {
  it("requires the network, the matching chain and a contract", () => {
    expect(parseConfig({}).ok).toBe(false);
    const wrongChain = parseConfig({ NEXT_PUBLIC_GENLAYER_NETWORK: "studionet", NEXT_PUBLIC_GENLAYER_CHAIN: "1", NEXT_PUBLIC_MANDATE_CONTRACT: AGENT });
    expect(wrongChain.ok).toBe(false);
    const ok = parseConfig({ NEXT_PUBLIC_GENLAYER_NETWORK: "studionet", NEXT_PUBLIC_GENLAYER_CHAIN: "61999", NEXT_PUBLIC_MANDATE_CONTRACT: AGENT });
    expect(ok.ok && ok.config.rpcUrl).toBe("https://studio.genlayer.com/api");
  });
});

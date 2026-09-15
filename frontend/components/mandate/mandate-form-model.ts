import type { TermsInput } from "@/lib/genlayer/mandate";
import { toMinorUnits } from "@/lib/utils/present";
import type { MandateForm } from "@/lib/utils/validation";
import type { Mandate } from "@/types/mandate";

/** The form a new mandate starts from: nothing pre-filled that the principal did not choose, except safe defaults. */
export function blankForm(nowSeconds: number, agent = ""): MandateForm {
  return {
    agent,
    agentLabel: "",
    actionType: "PURCHASE",
    target: "",
    currency: "USD",
    maxAmount: "",
    expiresAt: nowSeconds + 30 * 86400 - ((nowSeconds + 30 * 86400) % 60),
    intendedUse: "",
    conditions: [],
    sources: [{ url: "", purpose: "PROVIDER_STATUS" }],
    now: nowSeconds,
  };
}

/** A form holding a mandate's current terms, for proposing its next version. */
export function formFromMandate(m: Mandate, nowSeconds: number): MandateForm {
  const t = m.terms;
  const digits = t.currency === "JPY" || t.currency === "KRW" ? 0 : 2;
  return {
    agent: m.agent,
    agentLabel: t.agent_label,
    actionType: t.action_type,
    target: t.target,
    currency: t.currency,
    maxAmount: (t.max_amount / 10 ** digits).toFixed(digits),
    expiresAt: t.expires_at,
    intendedUse: t.intended_use,
    conditions: t.conditions.map((c) => ({ key: c.key, requirement: c.requirement })),
    sources: t.sources.map((s) => ({ url: s.url, purpose: s.purpose })),
    now: nowSeconds,
  };
}

/** Exactly what will be sent to the contract, derived from a valid form. */
export function termsFromForm(f: MandateForm): TermsInput {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  return {
    agentLabel: clean(f.agentLabel),
    actionType: f.actionType,
    target: clean(f.target),
    maxAmount: toMinorUnits(f.maxAmount, f.currency.toUpperCase()) ?? 0,
    currency: f.currency.trim().toUpperCase(),
    expiresAt: f.expiresAt,
    intendedUse: clean(f.intendedUse),
    conditions: f.conditions.map((c) => ({ key: c.key, requirement: clean(c.requirement) })),
    sources: f.sources.map((s) => ({ url: s.url.trim(), purpose: s.purpose })),
  };
}

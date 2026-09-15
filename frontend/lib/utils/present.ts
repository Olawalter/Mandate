import type {
  AuthorizationRequest,
  ConditionKey,
  Decision,
  Finding,
  Mandate,
  PreflightCheck,
  SourcePurpose,
} from "@/types/mandate";

/**
 * Every word the interface shows about contract state comes from here, so a
 * code never leaks onto a screen and the same state reads the same way
 * everywhere. Values are formatted, never invented: each function only
 * renames or formats a field the contract returned.
 */

export const DECISION_LABEL: Record<Decision, string> = {
  AUTHORIZED: "Authorized",
  DENIED: "Denied",
  REASSESS_REQUIRED: "Reassess required",
};

export const DECISION_SUMMARY: Record<Decision, string> = {
  AUTHORIZED: "Every hard limit holds and every condition is satisfied by evidence read at request time.",
  DENIED: "The request violates the mandate or a condition it depends on.",
  REASSESS_REQUIRED:
    "The previous authorization cannot safely be relied upon because a condition relevant to this mandate has changed or could not be verified.",
};

export const REASON_TEXT: Record<string, string> = {
  MANDATE_REVOKED: "The principal revoked this mandate.",
  MANDATE_EXPIRED: "The mandate had expired when the request was made.",
  VERSION_MISMATCH: "The request named a mandate version that is no longer current.",
  ACTION_NOT_PERMITTED: "The requested action is not the action this mandate permits.",
  TARGET_NOT_PERMITTED: "The requested target is not the target this mandate permits.",
  CURRENCY_MISMATCH: "The request uses a different currency from the mandate.",
  AMOUNT_EXCEEDS_LIMIT: "The requested amount is outside the mandate's limit.",
  CONDITIONS_SATISFIED: "Every condition was satisfied by a quoted passage from its evidence source.",
  CONDITION_VIOLATED: "The evidence shows a condition is not met on a version that was never authorized.",
  MATERIAL_CHANGE: "A condition that justified an earlier authorization of this version no longer holds.",
  EVIDENCE_INCONCLUSIVE: "At least one condition could not be verified from the evidence.",
  EVIDENCE_UNAVAILABLE: "At least one evidence source could not be read.",
};

export function reasonText(code: string): string {
  return REASON_TEXT[code] ?? "The contract recorded a reason this interface does not recognise.";
}

export const CONDITION_LABEL: Record<ConditionKey, string> = {
  provider_eligible: "Provider eligible",
  service_available: "Service available",
  terms_compatible: "Terms compatible",
  intended_use_permitted: "Intended use permitted",
};

export const FINDING_LABEL: Record<Finding, string> = {
  SATISFIED: "Satisfied",
  VIOLATED: "Violated",
  UNVERIFIED: "Not verified",
};

export const PURPOSE_LABEL: Record<SourcePurpose, string> = {
  PROVIDER_STATUS: "Provider status",
  TERMS_COMPATIBILITY: "Terms compatibility",
  ELIGIBILITY: "Eligibility",
  POLICY: "Policy",
};

export const CHECK_LABEL: Record<PreflightCheck, string> = {
  agent_matches_mandate: "Agent matches mandate",
  mandate_active: "Mandate active",
  mandate_not_expired: "Mandate not expired",
  version_current: "Version current",
  action_permitted: "Action permitted",
  target_permitted: "Target permitted",
  currency_matches: "Currency matches",
  amount_within_limit: "Amount within limit",
};

export const ACTION_LABEL: Record<string, string> = {
  PURCHASE: "Purchase",
  SUBSCRIBE: "Subscribe",
  RENEW: "Renew",
  PAY: "Pay",
};

export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function shortHash(h: string): string {
  return h.length > 14 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h;
}

const CURRENCY_DIGITS: Record<string, number> = { JPY: 0, KRW: 0 };

export function minorDigits(currency: string): number {
  return CURRENCY_DIGITS[currency] ?? 2;
}

/** Minor units (as stored on-chain) to a display amount, e.g. 470000 USD -> $4,700.00 */
export function formatAmount(minor: number, currency: string): string {
  const digits = minorDigits(currency);
  const major = minor / 10 ** digits;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(major);
  } catch {
    return `${major.toLocaleString("en-US", { minimumFractionDigits: digits })} ${currency}`;
  }
}

/** A display amount typed by a person to integer minor units, or null when it is not a clean amount. */
export function toMinorUnits(text: string, currency: string): number | null {
  const digits = minorDigits(currency);
  const cleaned = text.replace(/[,\s]/g, "");
  const re = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`);
  if (!re.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const value = Number(whole) * 10 ** digits + Number(frac.padEnd(digits, "0") || "0");
  return Number.isSafeInteger(value) ? value : null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A UTC timestamp in words: 20 September 2026, 14:05 UTC */
export function formatTime(unixSeconds: number): string {
  if (!unixSeconds) return "Not recorded";
  const d = new Date(unixSeconds * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

export function formatDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function relativeTo(unixSeconds: number, nowSeconds: number): string {
  const delta = unixSeconds - nowSeconds;
  const abs = Math.abs(delta);
  const unit = abs >= 86400 ? [Math.round(abs / 86400), "day"] : abs >= 3600 ? [Math.round(abs / 3600), "hour"] : [Math.max(1, Math.round(abs / 60)), "minute"];
  const words = `${unit[0]} ${unit[1]}${unit[0] === 1 ? "" : "s"}`;
  return delta >= 0 ? `in ${words}` : `${words} ago`;
}

export type MandateState = "ACTIVE" | "EXPIRED" | "REVOKED";

/** Stored status plus the stored expiry, read against the viewer's clock for display only. */
export function mandateState(m: Pick<Mandate, "status" | "terms">, nowSeconds: number): MandateState {
  if (m.status === "REVOKED") return "REVOKED";
  return nowSeconds >= m.terms.expires_at ? "EXPIRED" : "ACTIVE";
}

export const MANDATE_STATE_LABEL: Record<MandateState, string> = {
  ACTIVE: "Active",
  EXPIRED: "Expired",
  REVOKED: "Revoked",
};

export function requestTitle(r: Pick<AuthorizationRequest, "action_type" | "amount" | "currency" | "target">): string {
  return `${ACTION_LABEL[r.action_type] ?? r.action_type} ${formatAmount(r.amount, r.currency)} of ${r.target}`;
}

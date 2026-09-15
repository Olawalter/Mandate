import { z } from "zod";

import { toMinorUnits } from "@/lib/utils/present";
import {
  ACTIONS,
  CONDITION_KEYS,
  PREFLIGHT_CHECKS,
  SOURCE_PURPOSES,
  type Mandate,
  type PreflightCheck,
} from "@/types/mandate";

/**
 * Form validation mirrors the contract's own rules so a person learns what is
 * wrong before signing. It is a convenience, never the authority: the
 * contract re-validates every field and every permission itself.
 */

export const LIMITS = {
  agentLabel: 60,
  target: 120,
  intendedUse: 300,
  requirement: 300,
  url: 300,
  sources: 4,
  termDays: 366,
  maxMinor: 10 ** 15,
} as const;

const line = (label: string, max: number) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .max(max, `${label} can be at most ${max} characters.`)
        .refine((s) => !/<<<|>>>/.test(s), `${label} cannot contain <<< or >>>.`),
    );

function normalizeUrl(u: string): string {
  const [scheme, rest = ""] = u.trim().split("://");
  const [netloc0, ...path] = rest.split("/");
  let netloc = netloc0.toLowerCase();
  if (netloc.endsWith(":443")) netloc = netloc.slice(0, -4);
  if (netloc.startsWith("www.")) netloc = netloc.slice(4);
  return `${scheme.toLowerCase()}://${netloc}/${path.join("/").split("#")[0].replace(/\/+$/, "")}`;
}

export const mandateFormSchema = z
  .object({
    agent: z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/, "Enter the agent's 0x wallet address."),
    agentLabel: line("The agent name", LIMITS.agentLabel),
    actionType: z.enum(ACTIONS, { message: "Choose the action this agent may take." }),
    target: line("The target", LIMITS.target).refine((s) => s.length > 0, "Name the target."),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a three-letter currency code."),
    maxAmount: z.string(),
    expiresAt: z.number({ message: "Choose an expiry." }).int(),
    intendedUse: line("The intended use", LIMITS.intendedUse).refine((s) => s.length > 0, "Describe the intended use."),
    conditions: z
      .array(z.object({ key: z.enum(CONDITION_KEYS), requirement: line("A requirement", LIMITS.requirement) }))
      .min(1, "Add at least one condition."),
    sources: z
      .array(z.object({ url: z.string().trim(), purpose: z.enum(SOURCE_PURPOSES) }))
      .min(1, "Add at least one evidence source.")
      .max(LIMITS.sources, `At most ${LIMITS.sources} evidence sources.`),
    now: z.number().int(),
  })
  .superRefine((v, ctx) => {
    const minor = toMinorUnits(v.maxAmount, v.currency);
    if (minor === null || minor <= 0 || minor > LIMITS.maxMinor) {
      ctx.addIssue({ code: "custom", path: ["maxAmount"], message: "Enter a positive amount, like 5000 or 5000.00." });
    }
    if (v.expiresAt <= v.now) ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "The expiry must be in the future." });
    if (v.expiresAt > v.now + LIMITS.termDays * 86400) {
      ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "A mandate can last at most 366 days." });
    }
    const keys = new Set<string>();
    v.conditions.forEach((c, i) => {
      if (keys.has(c.key)) ctx.addIssue({ code: "custom", path: ["conditions", i, "key"], message: "Each condition can be listed once." });
      keys.add(c.key);
      if (!c.requirement) ctx.addIssue({ code: "custom", path: ["conditions", i, "requirement"], message: "Describe what must hold." });
    });
    const urls = new Set<string>();
    v.sources.forEach((s, i) => {
      let host = "";
      try {
        host = new URL(s.url).hostname;
      } catch {
        /* reported below */
      }
      if (!/^https:\/\/\S+$/.test(s.url) || s.url.length > LIMITS.url || !host.includes(".")) {
        ctx.addIssue({ code: "custom", path: ["sources", i, "url"], message: "Use a full https:// address." });
        return;
      }
      const n = normalizeUrl(s.url);
      if (urls.has(n)) ctx.addIssue({ code: "custom", path: ["sources", i, "url"], message: "This source repeats an earlier one." });
      urls.add(n);
    });
  });

export type MandateForm = z.input<typeof mandateFormSchema>;

export function formErrors(form: MandateForm): Record<string, string> {
  const r = mandateFormSchema.safeParse(form);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * The deterministic checks the contract will run, computed from the mandate
 * as the contract returned it — shown before signing so a request that is
 * certain to be DENIED is visible as such. The contract runs them again
 * against the transaction time; this preview uses the browser clock.
 */
export type PreviewCheck = { check: PreflightCheck; passed: boolean };

export function previewPreflight(
  m: Mandate,
  req: { signer?: string; version: number; actionType: string; target: string; amount: number | null; currency: string },
  nowSeconds: number,
): PreviewCheck[] {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const passed: Record<PreflightCheck, boolean> = {
    agent_matches_mandate: !!req.signer && req.signer.toLowerCase() === m.agent.toLowerCase(),
    mandate_active: m.status === "ACTIVE",
    mandate_not_expired: nowSeconds < m.terms.expires_at,
    version_current: req.version === m.version,
    action_permitted: req.actionType === m.terms.action_type,
    target_permitted: norm(req.target) === norm(m.terms.target),
    currency_matches: req.currency.toUpperCase() === m.terms.currency,
    amount_within_limit: req.amount !== null && req.amount > 0 && req.amount <= m.terms.max_amount,
  };
  return PREFLIGHT_CHECKS.map((check) => ({ check, passed: passed[check] }));
}

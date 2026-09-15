import { z } from "zod";

/**
 * The shapes the MANDATE contract's views return, checked at the boundary.
 * These mirror contracts/mandate.py and the deployed schema; a read that does
 * not match is an error, never silently coerced into something displayable.
 */

export const DECISIONS = ["AUTHORIZED", "DENIED", "REASSESS_REQUIRED"] as const;
export const ACTIONS = ["PURCHASE", "SUBSCRIBE", "RENEW", "PAY"] as const;
export const CONDITION_KEYS = [
  "provider_eligible",
  "service_available",
  "terms_compatible",
  "intended_use_permitted",
] as const;
export const SOURCE_PURPOSES = ["PROVIDER_STATUS", "TERMS_COMPATIBILITY", "ELIGIBILITY", "POLICY"] as const;
export const FINDINGS = ["SATISFIED", "VIOLATED", "UNVERIFIED"] as const;

export const PREFLIGHT_CHECKS = [
  "agent_matches_mandate",
  "mandate_active",
  "mandate_not_expired",
  "version_current",
  "action_permitted",
  "target_permitted",
  "currency_matches",
  "amount_within_limit",
] as const;

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const conditionSchema = z.object({ key: z.enum(CONDITION_KEYS), requirement: z.string() });
export const sourceSchema = z.object({
  id: z.string(),
  url: z.string(),
  purpose: z.enum(SOURCE_PURPOSES),
  host: z.string(),
});

export const termsSchema = z.object({
  version: z.number().int().positive(),
  created_at: z.number().int(),
  agent_label: z.string(),
  action_type: z.enum(ACTIONS),
  target: z.string(),
  max_amount: z.number().int(),
  currency: z.string(),
  expires_at: z.number().int(),
  intended_use: z.string(),
  conditions: z.array(conditionSchema),
  sources: z.array(sourceSchema),
});

export const mandateSchema = z.object({
  mandate_id: z.string(),
  principal: address,
  agent: address,
  status: z.enum(["ACTIVE", "REVOKED"]),
  version: z.number().int().positive(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
  revoked_at: z.number().int(),
  request_count: z.number().int(),
  authorized_count: z.number().int(),
  denied_count: z.number().int(),
  reassess_count: z.number().int(),
  baseline_snapshot_id: z.number().int(),
  terms: termsSchema,
});

export const requestSchema = z.object({
  request_id: z.string(),
  mandate_id: z.string(),
  mandate_version: z.number().int(),
  requested_version: z.number().int(),
  principal: address,
  agent: address,
  action_type: z.string(),
  target: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  request_key: z.string(),
  submitted_at: z.number().int(),
  preflight: z.array(z.object({ check: z.enum(PREFLIGHT_CHECKS), passed: z.boolean() })),
  assessed: z.boolean(),
  snapshot_id: z.number().int(),
  decision: z.enum(DECISIONS),
  reason_code: z.string(),
  material_change: z.boolean(),
  affected_conditions: z.array(z.enum(CONDITION_KEYS)),
});

const flag = z.boolean().nullable();

export const snapshotSchema = z.object({
  snapshot_id: z.number().int(),
  mandate_id: z.string(),
  mandate_version: z.number().int(),
  request_id: z.string(),
  evaluated_at: z.number().int(),
  source_count: z.number().int(),
  sources: z.array(z.object({ id: z.string(), url: z.string(), purpose: z.enum(SOURCE_PURPOSES), readable: z.boolean() })),
  conditions: z.array(
    z.object({ key: z.enum(CONDITION_KEYS), finding: z.enum(FINDINGS), source: z.string(), quote: z.string() }),
  ),
  provider_eligible: flag,
  service_available: flag,
  terms_compatible: flag,
  intended_use_permitted: flag,
  material_change: z.boolean(),
  affected_conditions: z.array(z.enum(CONDITION_KEYS)),
  baseline_snapshot_id: z.number().int(),
});

export const receiptSchema = z.object({
  request: requestSchema,
  mandate_terms: termsSchema,
  snapshot: snapshotSchema.nullable(),
});

export const protocolSchema = z.object({
  protocol_version: z.string(),
  decision_states: z.array(z.string()),
  actions: z.array(z.string()),
  condition_keys: z.array(z.string()),
  source_purposes: z.array(z.string()),
  max_sources: z.number().int(),
  max_mandate_term_seconds: z.number().int(),
  mandate_count: z.number().int(),
  active_count: z.number().int(),
  request_count: z.number().int(),
  snapshot_count: z.number().int(),
  authorized_total: z.number().int(),
  denied_total: z.number().int(),
  reassess_total: z.number().int(),
});

export const pageOf = <T extends z.ZodTypeAny>(item: T) => z.object({ total: z.number().int(), items: z.array(item) });

export type Decision = (typeof DECISIONS)[number];
export type Action = (typeof ACTIONS)[number];
export type ConditionKey = (typeof CONDITION_KEYS)[number];
export type SourcePurpose = (typeof SOURCE_PURPOSES)[number];
export type Finding = (typeof FINDINGS)[number];
export type PreflightCheck = (typeof PREFLIGHT_CHECKS)[number];
export type Terms = z.infer<typeof termsSchema>;
export type Mandate = z.infer<typeof mandateSchema>;
export type AuthorizationRequest = z.infer<typeof requestSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Receipt = z.infer<typeof receiptSchema>;
export type ProtocolInfo = z.infer<typeof protocolSchema>;

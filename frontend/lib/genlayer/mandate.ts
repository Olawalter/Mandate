import { TransactionHashVariant } from "genlayer-js/types";
import { z } from "zod";

import type { AppConfig } from "@/lib/config";
import type { GenLayerClient } from "@/lib/genlayer/client";
import {
  mandateSchema,
  pageOf,
  protocolSchema,
  receiptSchema,
  requestSchema,
  snapshotSchema,
  termsSchema,
  type AuthorizationRequest,
  type Mandate,
} from "@/types/mandate";

/**
 * The MANDATE Intelligent Contract as GenLayer describes it. Every method name
 * and parameter below was read from `gen_getContractSchema` for the deployed
 * contract (scripts/inspect.py writes it to docs/deployment.json); every view
 * is parsed with Zod, so an answer that is not what the contract returns is an
 * error, never a guess.
 */

export const REQUIRED_METHODS = {
  create_mandate: [
    "agent", "agent_label", "action_type", "target", "max_amount", "currency", "expires_at", "intended_use",
    "conditions_json", "sources_json",
  ],
  update_mandate: [
    "mandate_id", "expected_version", "agent_label", "action_type", "target", "max_amount", "currency",
    "expires_at", "intended_use", "conditions_json", "sources_json",
  ],
  revoke_mandate: ["mandate_id"],
  request_authorization: ["mandate_id", "mandate_version", "action_type", "target", "amount", "currency", "request_key"],
  get_protocol_info: [],
  get_mandate: ["mandate_id"],
  get_mandate_version: ["mandate_id", "version"],
  get_authorization: ["request_id"],
  get_evidence_snapshot: ["snapshot_id"],
  get_decision_receipt: ["request_id"],
  get_agent_mandates: ["agent", "offset", "limit"],
  get_principal_mandates: ["principal", "offset", "limit"],
  list_mandates: ["offset", "limit"],
  list_requests: ["offset", "limit"],
  list_mandate_requests: ["mandate_id", "offset", "limit"],
} as const;

export type WriteMethod = "create_mandate" | "update_mandate" | "revoke_mandate" | "request_authorization";

// ── reads ───────────────────────────────────────────────────────────────────

export type Finality = "final" | "latest";

async function view<T>(
  client: GenLayerClient,
  config: AppConfig,
  fn: keyof typeof REQUIRED_METHODS,
  args: (string | number)[],
  schema: z.ZodType<T>,
  finality: Finality = "latest",
): Promise<T> {
  const raw = await client.readContract({
    address: config.contractAddress,
    functionName: fn,
    args,
    jsonSafeReturn: true,
    // LATEST_FINAL only where durable state is the point (receipts); latest non-final otherwise
    transactionHashVariant:
      finality === "final" ? TransactionHashVariant.LATEST_FINAL : TransactionHashVariant.LATEST_NONFINAL,
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error(`The contract's ${fn} answer did not match the MANDATE interface.`);
  return parsed.data;
}

/** A view refusal ("does not exist") is an answer, not an outage. */
export function isMissing(err: unknown): boolean {
  return /does not exist|has no version/i.test(String((err as Error)?.message ?? err));
}

export const reads = {
  protocol: (c: GenLayerClient, cfg: AppConfig) => view(c, cfg, "get_protocol_info", [], protocolSchema),
  mandate: (c: GenLayerClient, cfg: AppConfig, id: string) => view(c, cfg, "get_mandate", [id], mandateSchema),
  version: (c: GenLayerClient, cfg: AppConfig, id: string, v: number) =>
    view(c, cfg, "get_mandate_version", [id, v], termsSchema),
  authorization: (c: GenLayerClient, cfg: AppConfig, id: string) =>
    view(c, cfg, "get_authorization", [id], requestSchema),
  snapshot: (c: GenLayerClient, cfg: AppConfig, id: string) =>
    view(c, cfg, "get_evidence_snapshot", [id], snapshotSchema),
  receipt: (c: GenLayerClient, cfg: AppConfig, id: string, finality: Finality = "latest") =>
    view(c, cfg, "get_decision_receipt", [id], receiptSchema, finality),
  agentMandates: (c: GenLayerClient, cfg: AppConfig, agent: string, offset = 0, limit = 50) =>
    view(c, cfg, "get_agent_mandates", [agent.toLowerCase(), offset, limit], pageOf(mandateSchema)),
  principalMandates: (c: GenLayerClient, cfg: AppConfig, principal: string, offset = 0, limit = 50) =>
    view(c, cfg, "get_principal_mandates", [principal.toLowerCase(), offset, limit], pageOf(mandateSchema)),
  mandates: (c: GenLayerClient, cfg: AppConfig, offset = 0, limit = 50) =>
    view(c, cfg, "list_mandates", [offset, limit], pageOf(mandateSchema)),
  requests: (c: GenLayerClient, cfg: AppConfig, offset = 0, limit = 50) =>
    view(c, cfg, "list_requests", [offset, limit], pageOf(requestSchema)),
  mandateRequests: (c: GenLayerClient, cfg: AppConfig, id: string, offset = 0, limit = 50) =>
    view(c, cfg, "list_mandate_requests", [id, offset, limit], pageOf(requestSchema)),
};

// ── deployment validation ───────────────────────────────────────────────────

export type DeploymentCheck = { ok: true; version: string } | { ok: false; reason: string };

/**
 * Is the configured address really a MANDATE deployment? The schema GenLayer
 * derived from the deployed code must expose every method this app calls
 * with the same parameters, and the protocol view must name itself MANDATE.
 */
export function checkSchema(schema: unknown): string | null {
  const methods = (schema as { methods?: Record<string, { params?: [string, string][] }> })?.methods;
  if (!methods || typeof methods !== "object") return "No contract schema exists at the configured address.";
  for (const [name, params] of Object.entries(REQUIRED_METHODS)) {
    const m = methods[name];
    if (!m) return `The contract at the configured address has no ${name} method, so it is not MANDATE.`;
    const names = (m.params ?? []).map((p) => p[0]);
    if (names.join(",") !== (params as readonly string[]).join(",")) {
      return `The contract's ${name} method takes different parameters than MANDATE's.`;
    }
  }
  return null;
}

export async function validateDeployment(c: GenLayerClient, cfg: AppConfig): Promise<DeploymentCheck> {
  let schema: unknown;
  try {
    schema = await c.getContractSchema(cfg.contractAddress);
  } catch {
    return { ok: false, reason: "No contract could be read at the configured address on this network." };
  }
  const problem = checkSchema(schema);
  if (problem) return { ok: false, reason: problem };
  try {
    const info = await reads.protocol(c, cfg);
    if (!info.protocol_version.startsWith("MANDATE")) {
      return { ok: false, reason: "The contract at the configured address does not identify itself as MANDATE." };
    }
    return { ok: true, version: info.protocol_version };
  } catch {
    return { ok: false, reason: "The contract at the configured address did not answer as MANDATE." };
  }
}

// ── writes ──────────────────────────────────────────────────────────────────

export type TermsInput = {
  agentLabel: string;
  actionType: string;
  target: string;
  maxAmount: number;
  currency: string;
  expiresAt: number;
  intendedUse: string;
  conditions: { key: string; requirement: string }[];
  sources: { url: string; purpose: string }[];
};

export function createCall(agent: string, t: TermsInput) {
  return {
    functionName: "create_mandate" as const,
    args: [agent, t.agentLabel, t.actionType, t.target, t.maxAmount, t.currency, t.expiresAt, t.intendedUse,
      JSON.stringify(t.conditions), JSON.stringify(t.sources)] as (string | number)[],
    value: 0n,
  };
}

export function updateCall(mandateId: string, expectedVersion: number, t: TermsInput) {
  return {
    functionName: "update_mandate" as const,
    args: [mandateId, expectedVersion, t.agentLabel, t.actionType, t.target, t.maxAmount, t.currency, t.expiresAt,
      t.intendedUse, JSON.stringify(t.conditions), JSON.stringify(t.sources)] as (string | number)[],
    value: 0n,
  };
}

export function revokeCall(mandateId: string) {
  return { functionName: "revoke_mandate" as const, args: [mandateId] as (string | number)[], value: 0n };
}

export type RequestInput = {
  mandateId: string;
  version: number;
  actionType: string;
  target: string;
  amount: number;
  currency: string;
  requestKey: string;
};

export function requestCall(r: RequestInput) {
  return {
    functionName: "request_authorization" as const,
    args: [r.mandateId, r.version, r.actionType, r.target, r.amount, r.currency, r.requestKey] as (string | number)[],
    value: 0n,
  };
}

/** A request key the agent has not used before on this mandate: time-ordered and unguessable enough. */
export function newRequestKey(now = Date.now(), rand: () => number = Math.random): string {
  const suffix = Math.floor(rand() * 36 ** 6).toString(36).padStart(6, "0");
  return `req-${now.toString(36)}-${suffix}`;
}

// ── reconciliation predicates (the contract's own state shows the write) ──

export function mandateCreated(c: GenLayerClient, cfg: AppConfig, principal: string, knownTotal: number) {
  return async (): Promise<boolean> => (await reads.principalMandates(c, cfg, principal, 0, 1)).total > knownTotal;
}

export function versionReached(c: GenLayerClient, cfg: AppConfig, id: string, version: number) {
  return async (): Promise<boolean> => (await reads.mandate(c, cfg, id)).version >= version;
}

export function mandateRevoked(c: GenLayerClient, cfg: AppConfig, id: string) {
  return async (): Promise<boolean> => (await reads.mandate(c, cfg, id)).status === "REVOKED";
}

/** The request this agent sent with this key, once the contract has recorded its decision. */
export async function findRequestByKey(
  c: GenLayerClient,
  cfg: AppConfig,
  mandateId: string,
  requestKey: string,
): Promise<AuthorizationRequest | null> {
  const page = await reads.mandateRequests(c, cfg, mandateId, 0, 10);
  return page.items.find((r) => r.request_key === requestKey) ?? null;
}

export function mandateExpired(m: Pick<Mandate, "terms">, nowSeconds: number): boolean {
  return nowSeconds >= m.terms.expires_at;
}

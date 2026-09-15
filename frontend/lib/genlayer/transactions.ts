import { abi } from "genlayer-js";

import type { AppConfig } from "@/lib/config";
import type { GenLayerClient } from "@/lib/genlayer/client";
import type { AuthorizationRequest } from "@/types/mandate";

/**
 * Transactions as GenLayer StudioNet reports them (`sim_getTransactionsForAddress`).
 * Nothing here is inferred: the method and arguments are decoded from the
 * transaction's own calldata, the status is GenLayer's, and the execution
 * result is the leader receipt's. The endpoint returns an address's most
 * recent transactions, so views built on it say "recent".
 */

export type Phase = "pending" | "consensus" | "accepted" | "finalized" | "undetermined";

export const PHASE_LABEL: Record<Phase, string> = {
  pending: "Processing",
  consensus: "In consensus",
  accepted: "Accepted, appealable",
  finalized: "Finalized",
  undetermined: "No decision reached",
};

export type ChainTx = {
  hash: `0x${string}`;
  from: string;
  to: string;
  status: string;
  phase: Phase;
  method: string | null;
  args: unknown[];
  createdAt: string;
  consensus: string | null;
  executionOk: boolean | null;
};

type RawTx = {
  hash?: string;
  from_address?: string;
  to_address?: string;
  status?: string;
  type?: number;
  created_at?: string;
  data?: { calldata?: string } | null;
  result_name?: string;
  consensus_data?: { leader_receipt?: { execution_result?: string }[] | { execution_result?: string } } | null;
};

export function phaseOf(status: string): Phase {
  if (status === "FINALIZED") return "finalized";
  if (["ACCEPTED", "APPEAL_REVEALING", "APPEAL_COMMITTING", "READY_TO_FINALIZE"].includes(status)) return "accepted";
  if (["COMMITTING", "REVEALING"].includes(status)) return "consensus";
  if (["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"].includes(status)) return "undetermined";
  return "pending";
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** The method and arguments a call carried, decoded from its GenVM calldata. */
export function decodeCall(calldata: string | undefined): { method: string | null; args: unknown[] } {
  if (!calldata) return { method: null, args: [] };
  try {
    const decoded = abi.calldata.decode(base64ToBytes(calldata)) as unknown;
    const get = (k: string) => (decoded instanceof Map ? decoded.get(k) : (decoded as Record<string, unknown>)?.[k]);
    const method = get("method");
    const args = get("args");
    return { method: typeof method === "string" ? method : null, args: Array.isArray(args) ? args : [] };
  } catch {
    return { method: null, args: [] };
  }
}

export function toChainTx(raw: RawTx): ChainTx | null {
  if (!raw.hash || !/^0x[0-9a-fA-F]{64}$/.test(raw.hash)) return null;
  const lr = raw.consensus_data?.leader_receipt;
  const leader = Array.isArray(lr) ? lr[0] : lr;
  const { method, args } = decodeCall(raw.data?.calldata);
  const status = raw.status ?? "PENDING";
  return {
    hash: raw.hash as `0x${string}`,
    from: raw.from_address ?? "",
    to: raw.to_address ?? "",
    status,
    phase: phaseOf(status),
    method,
    args,
    createdAt: raw.created_at ?? "",
    consensus: raw.result_name ?? null,
    executionOk: leader?.execution_result ? leader.execution_result === "SUCCESS" : null,
  };
}

async function forAddress(client: GenLayerClient, address: string): Promise<ChainTx[]> {
  const raw = (await client.request({ method: "sim_getTransactionsForAddress", params: [address] } as never)) as RawTx[] | null;
  return (raw ?? []).map(toChainTx).filter((t): t is ChainTx => t !== null);
}

/** Recent calls to the MANDATE contract, newest first. */
export async function contractTransactions(client: GenLayerClient, config: AppConfig): Promise<ChainTx[]> {
  const all = await forAddress(client, config.contractAddress);
  const contract = config.contractAddress.toLowerCase();
  return all
    .filter((t) => t.to.toLowerCase() === contract && t.method)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * The transaction that recorded a decision: sent by the request's agent to
 * this contract, calling request_authorization on the same mandate with the
 * same request key. The key is unique per mandate, so at most one succeeded.
 */
export function matchesRequest(t: ChainTx, config: AppConfig, r: Pick<AuthorizationRequest, "mandate_id" | "request_key" | "agent">): boolean {
  return (
    t.to.toLowerCase() === config.contractAddress.toLowerCase() &&
    t.from.toLowerCase() === r.agent.toLowerCase() &&
    t.method === "request_authorization" &&
    String(t.args[0]) === r.mandate_id &&
    String(t.args[6]) === r.request_key &&
    t.executionOk !== false
  );
}

export async function findDecisionTransaction(client: GenLayerClient, config: AppConfig, r: AuthorizationRequest): Promise<ChainTx | null> {
  const txs = await forAddress(client, r.agent);
  return txs.find((t) => matchesRequest(t, config, r)) ?? null;
}

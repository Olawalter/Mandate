"use client";

import { useQuery } from "@tanstack/react-query";

import { contractTransactions, findDecisionTransaction } from "@/lib/genlayer/transactions";
import { useMandateApp } from "@/providers/app-providers";
import type { AuthorizationRequest } from "@/types/mandate";

/** Transactions sent to the MANDATE contract, as GenLayer reports them. */
export function useContractActivity() {
  const { client, config } = useMandateApp();
  return useQuery({
    queryKey: ["contract-activity", config.contractAddress],
    queryFn: () => contractTransactions(client, config),
    refetchInterval: 30_000,
  });
}

/** The GenLayer transaction that produced a recorded decision, found from chain data. */
export function useDecisionTransaction(request: AuthorizationRequest | undefined) {
  const { client, config } = useMandateApp();
  return useQuery({
    queryKey: ["decision-tx", request?.request_id],
    queryFn: () => findDecisionTransaction(client, config, request!),
    enabled: !!request,
    refetchInterval: (q) => (q.state.data?.status === "FINALIZED" ? false : 20_000),
  });
}

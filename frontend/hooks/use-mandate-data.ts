"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { reads, validateDeployment } from "@/lib/genlayer/mandate";
import { useMandateApp } from "@/providers/app-providers";

/** The browser clock in UTC seconds, ticking so expiry and previews stay current. Display only. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useDeployment() {
  const { client, config } = useMandateApp();
  return useQuery({
    queryKey: ["deployment", config.contractAddress],
    queryFn: () => validateDeployment(client, config),
    staleTime: 10 * 60_000,
  });
}

export function useProtocol() {
  const { client, config } = useMandateApp();
  return useQuery({ queryKey: ["protocol"], queryFn: () => reads.protocol(client, config) });
}

export function useMandates(limit = 50) {
  const { client, config } = useMandateApp();
  return useQuery({ queryKey: ["mandates", limit], queryFn: () => reads.mandates(client, config, 0, limit) });
}

export function useMandate(id: string) {
  const { client, config } = useMandateApp();
  return useQuery({ queryKey: ["mandate", id], queryFn: () => reads.mandate(client, config, id), retry: false });
}

export function useMandateVersion(id: string, version: number | undefined) {
  const { client, config } = useMandateApp();
  return useQuery({
    queryKey: ["mandate-version", id, version],
    queryFn: () => reads.version(client, config, id, version!),
    enabled: !!version,
    staleTime: Infinity, // a version never changes once written
  });
}

export function useRequests(limit = 50) {
  const { client, config } = useMandateApp();
  return useQuery({ queryKey: ["requests", limit], queryFn: () => reads.requests(client, config, 0, limit) });
}

export function useMandateRequests(id: string, limit = 50) {
  const { client, config } = useMandateApp();
  return useQuery({
    queryKey: ["mandate-requests", id, limit],
    queryFn: () => reads.mandateRequests(client, config, id, 0, limit),
  });
}

export function useAgentMandates(agent: string | undefined) {
  const { client, config } = useMandateApp();
  return useQuery({
    queryKey: ["agent-mandates", agent?.toLowerCase()],
    queryFn: () => reads.agentMandates(client, config, agent!, 0, 50),
    enabled: !!agent,
  });
}

export function usePrincipalMandates(principal: string | undefined) {
  const { client, config } = useMandateApp();
  return useQuery({
    queryKey: ["principal-mandates", principal?.toLowerCase()],
    queryFn: () => reads.principalMandates(client, config, principal!, 0, 50),
    enabled: !!principal,
  });
}

export function useReceipt(id: string) {
  const { client, config } = useMandateApp();
  return useQuery({ queryKey: ["receipt", id], queryFn: () => reads.receipt(client, config, id), retry: false });
}

/** The same receipt read from LATEST_FINAL state: present only once the decision is durable. */
export function useFinalReceipt(id: string) {
  const { client, config } = useMandateApp();
  return useQuery({
    queryKey: ["receipt-final", id],
    queryFn: async () => {
      try {
        return await reads.receipt(client, config, id, "final");
      } catch {
        return null;
      }
    },
    refetchInterval: (q) => (q.state.data ? false : 30_000),
  });
}

export function useSnapshot(id: number | undefined) {
  const { client, config } = useMandateApp();
  return useQuery({
    queryKey: ["snapshot", id],
    queryFn: () => reads.snapshot(client, config, String(id)),
    enabled: !!id,
    staleTime: Infinity,
  });
}

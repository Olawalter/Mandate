"use client";

import { useConnection, useSwitchChain } from "wagmi";

import { Button } from "@/components/ui/button";
import { useDeployment } from "@/hooks/use-mandate-data";
import { walletErrorMessage } from "@/lib/genlayer/tx";
import { useMandateApp } from "@/providers/app-providers";

/** Is the connected wallet on the network MANDATE is deployed to? */
export function useNetwork() {
  const { config } = useMandateApp();
  const { chainId, status } = useConnection();
  const connected = status === "connected";
  return { connected, chainId, expected: config.chainId, name: config.networkName, correct: connected && chainId === config.chainId };
}

export function NetworkPill() {
  const net = useNetwork();
  const deployment = useDeployment();
  const bad = deployment.data && !deployment.data.ok;
  const wrong = net.connected && !net.correct;
  const tone = bad || wrong ? "bg-no" : net.correct && deployment.data?.ok ? "bg-yes" : "bg-dim";
  const label = bad ? "Contract not verified" : wrong ? "Wrong network" : net.name;
  return (
    <span className="hidden items-center gap-2 rounded-md border border-line px-2.5 py-1.5 font-mono text-[11px] text-dim md:flex">
      <span className={`size-1.5 rounded-full ${tone}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Explicit, blocking notices: a wallet on the wrong network, or a configured
 * address that is not a MANDATE deployment. Switching is offered only as a
 * button the user presses; nothing switches silently.
 */
export function NetworkNotices() {
  const net = useNetwork();
  const deployment = useDeployment();
  const switchChain = useSwitchChain();

  return (
    <>
      {deployment.data && !deployment.data.ok ? (
        <div role="alert" className="border-b border-no/40 bg-no/10 px-4 py-3 text-sm sm:px-8">
          <strong className="font-semibold text-no">This app is not connected to a verified MANDATE contract. </strong>
          <span className="text-dim">{deployment.data.reason} Transactions are disabled.</span>
        </div>
      ) : null}
      {net.connected && !net.correct ? (
        <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-maybe/40 bg-maybe/10 px-4 py-3 text-sm sm:px-8">
          <strong className="font-semibold text-maybe">Your wallet is on the wrong network.</strong>
          <span className="text-dim">
            MANDATE runs on {net.name} (chain {net.expected}). Your wallet reports chain {net.chainId}. No transaction will be
            sent until this matches.
          </span>
          <Button size="sm" variant="outline" disabled={switchChain.isPending} onClick={() => switchChain.mutate({ chainId: net.expected })}>
            {switchChain.isPending ? "Waiting for wallet…" : `Switch to ${net.name}`}
          </Button>
          {switchChain.error ? <span className="text-no">{walletErrorMessage(switchChain.error)}</span> : null}
        </div>
      ) : null}
    </>
  );
}

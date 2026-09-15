"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { EIP1193Provider } from "viem";
import { useConnection } from "wagmi";

import { TxDock } from "@/components/authorization/tx-dock";
import { writeClient } from "@/lib/genlayer/client";
import type { DeploymentCheck } from "@/lib/genlayer/mandate";
import { initialTx, runWrite, type TxState } from "@/lib/genlayer/tx";
import { preflight } from "@/lib/wallet/preflight";
import { useMandateApp } from "@/providers/app-providers";

export type TxRecord = {
  id: number;
  title: string;
  /** What the write does, in words, shown once the contract reflects it. */
  effect: string;
  state: TxState;
  dismissed: boolean;
  /** Where the result can be seen, once it exists (e.g. a decision receipt). */
  href?: string;
};

export type WriteRequest = {
  title: string;
  effect: string;
  functionName: string;
  args: (string | number | bigint)[];
  value: bigint;
  reconciled: () => Promise<boolean | string>;
  /** Called with the record id as soon as the write starts, so a panel can follow it live. */
  onRecord?: (id: number) => void;
  /** Called once the contract's state shows the write; may return a link to the result. */
  onReconciled?: () => Promise<string | undefined> | string | undefined;
};

type TxContextValue = {
  records: TxRecord[];
  send: (req: WriteRequest) => Promise<TxRecord>;
  dismiss: (id: number) => void;
};

const TxContext = createContext<TxContextValue | null>(null);

export function useTx(): TxContextValue {
  const ctx = useContext(TxContext);
  if (!ctx) throw new Error("useTx outside TxProvider");
  return ctx;
}

export function TxProvider({ children }: { children: ReactNode }) {
  const { config } = useMandateApp();
  const { address, chainId, connector, status } = useConnection();
  const queryClient = useQueryClient();
  const [records, setRecords] = useState<TxRecord[]>([]);
  const nextId = useRef(1);

  const update = useCallback((id: number, patch: Partial<TxRecord>) => {
    setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const send = useCallback(
    async (req: WriteRequest): Promise<TxRecord> => {
      const id = nextId.current++;
      let record: TxRecord = { id, title: req.title, effect: req.effect, state: initialTx, dismissed: false };
      setRecords((rs) => [...rs.slice(-9), record]);
      req.onRecord?.(id);
      const failWith = (message: string) => {
        record = { ...record, state: { ...initialTx, stage: "FAILED", message } };
        update(id, record);
        return record;
      };

      // explicit wallet, network and contract validation before anything is signed
      const deployment = queryClient.getQueryData<DeploymentCheck>(["deployment", config.contractAddress]);
      const stop = preflight({ status, address, chainId, hasConnector: !!connector }, config, deployment?.ok);
      if (stop || !address || !connector) return failWith(stop ?? "Connect a wallet first.");
      let provider: EIP1193Provider;
      try {
        provider = (await connector.getProvider()) as EIP1193Provider;
      } catch {
        return failWith("The connected wallet did not provide a signing interface.");
      }

      const final = await runWrite({
        config,
        client: writeClient(config, address, provider),
        functionName: req.functionName,
        args: req.args,
        value: req.value,
        reconciled: req.reconciled,
        onUpdate: (state) => {
          record = { ...record, state };
          update(id, { state });
          if (state.stage === "CONTRACT_STATE_UPDATED" || state.stage === "FAILED") {
            void queryClient.invalidateQueries();
          }
        },
      });
      record = { ...record, state: final };
      if (final.stage === "CONTRACT_STATE_UPDATED" && req.onReconciled) {
        try {
          const href = await req.onReconciled();
          if (href) {
            record = { ...record, href };
            update(id, { href });
          }
        } catch {
          /* the write stands; only the link is missing */
        }
      }
      return record;
    },
    [address, chainId, config, connector, queryClient, status, update],
  );

  const dismiss = useCallback((id: number) => update(id, { dismissed: true }), [update]);

  // A write the contract reflects and GenLayer has finalized leaves the dock on its own after a
  // minute; everything else stays until dismissed, so nothing moves under a pointer mid-click.
  useEffect(() => {
    const done = records.filter((r) => !r.dismissed && r.state.stage === "CONTRACT_STATE_UPDATED" && r.state.finality === "finalized");
    if (!done.length) return;
    const t = setTimeout(() => done.forEach((r) => dismiss(r.id)), 60_000);
    return () => clearTimeout(t);
  }, [records, dismiss]);

  return (
    <TxContext.Provider value={{ records, send, dismiss }}>
      {children}
      <TxDock records={records} onDismiss={dismiss} />
    </TxContext.Provider>
  );
}

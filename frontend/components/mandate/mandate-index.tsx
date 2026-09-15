"use client";

import { FilePlus2 } from "lucide-react";
import { useState } from "react";
import { useConnection } from "wagmi";

import { EmptyState, LoadError, PageHeader } from "@/components/dashboard/empty-state";
import { MandateRow } from "@/components/mandate/mandate-card";
import { LinkButton } from "@/components/ui/link-button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentMandates, useMandates, useNow, usePrincipalMandates } from "@/hooks/use-mandate-data";

type Scope = "all" | "principal" | "agent";

export function MandateIndex() {
  const now = useNow();
  const { address } = useConnection();
  const [scope, setScope] = useState<Scope>("all");
  const all = useMandates(50);
  const mine = usePrincipalMandates(scope === "principal" ? address : undefined);
  const agent = useAgentMandates(scope === "agent" ? address : undefined);
  const q = scope === "all" ? all : scope === "principal" ? mine : agent;

  const tabs: { id: Scope; label: string; needsWallet: boolean }[] = [
    { id: "all", label: "All mandates", needsWallet: false },
    { id: "principal", label: "Granted by me", needsWallet: true },
    { id: "agent", label: "Granted to me", needsWallet: true },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Mandates"
        title="Mandates"
        actions={
          <LinkButton href="/mandates/new">
            <FilePlus2 data-icon="inline-start" /> New mandate
          </LinkButton>
        }
      >
        Each mandate names one agent, one action, one target, a hard amount limit, an expiry and the conditions its
        authority depends on. Newest first.
      </PageHeader>

      <div role="tablist" aria-label="Which mandates" className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={scope === t.id}
            onClick={() => setScope(t.id)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              scope === t.id ? "border-signal bg-signal/10 text-text" : "border-line text-dim hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {scope !== "all" && !address ? (
        <EmptyState title="Connect a wallet to see your mandates.">
          Mandates are indexed on-chain by principal and by agent address.
        </EmptyState>
      ) : (
        <>
          {q.isLoading ? <Skeleton className="h-24" /> : null}
          {q.error ? <LoadError what="mandates" error={q.error} /> : null}
          {q.data && q.data.items.length === 0 ? (
            <EmptyState title={scope === "agent" ? "No mandates name this wallet as agent." : "No mandates yet."}>
              Create a mandate to define what an autonomous agent is allowed to do.
            </EmptyState>
          ) : null}
          <ul className="grid gap-2">
            {q.data?.items.map((m) => <MandateRow key={m.mandate_id} m={m} now={now} />)}
          </ul>
          {q.data && q.data.total > q.data.items.length ? (
            <p className="mt-3 text-xs text-dim">
              Showing the newest {q.data.items.length} of {q.data.total}.
            </p>
          ) : null}
        </>
      )}
    </>
  );
}

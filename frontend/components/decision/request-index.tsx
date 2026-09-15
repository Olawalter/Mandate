"use client";

import { useState } from "react";

import { ActivityList } from "@/components/dashboard/activity-list";
import { EmptyState, LoadError, PageHeader } from "@/components/dashboard/empty-state";
import { RequestRow } from "@/components/decision/request-row";
import { Skeleton } from "@/components/ui/skeleton";
import { useContractActivity } from "@/hooks/use-activity";
import { useRequests } from "@/hooks/use-mandate-data";
import { DECISION_LABEL } from "@/lib/utils/present";
import { DECISIONS, type Decision } from "@/types/mandate";

export function RequestIndex() {
  const requests = useRequests(50);
  const activity = useContractActivity();
  const [filter, setFilter] = useState<Decision | "ALL">("ALL");
  const inFlight = (activity.data ?? []).filter(
    (t) => t.method === "request_authorization" && (t.phase === "pending" || t.phase === "consensus"),
  );
  const rows = (requests.data?.items ?? []).filter((r) => filter === "ALL" || r.decision === filter);

  return (
    <>
      <PageHeader eyebrow="Requests" title="Authorization requests">
        Every request an agent has made, with the decision the contract recorded. A request still in GenLayer consensus
        has no decision yet; it is listed separately until it does.
      </PageHeader>

      <section aria-labelledby="pending-title" className="mb-10 grid gap-3">
        <h2 id="pending-title" className="text-base font-semibold">Pending assessments</h2>
        {activity.error ? <LoadError what="pending transactions" error={activity.error} /> : null}
        {activity.data && inFlight.length === 0 ? (
          <p className="text-sm text-dim">No authorization request is in consensus right now.</p>
        ) : null}
        {inFlight.length ? <ActivityList filter="request_authorization" /> : null}
      </section>

      <section aria-labelledby="decided-title" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="decided-title" className="text-base font-semibold">Decided</h2>
          <div role="tablist" aria-label="Filter by decision" className="flex flex-wrap gap-2">
            {(["ALL", ...DECISIONS] as const).map((d) => (
              <button
                key={d}
                role="tab"
                type="button"
                aria-selected={filter === d}
                onClick={() => setFilter(d)}
                className={`rounded-md border px-3 py-1 text-xs ${filter === d ? "border-signal bg-signal/10 text-text" : "border-line text-dim hover:text-text"}`}
              >
                {d === "ALL" ? "All" : DECISION_LABEL[d]}
              </button>
            ))}
          </div>
        </div>
        {requests.isLoading ? <Skeleton className="h-24" /> : null}
        {requests.error ? <LoadError what="requests" error={requests.error} /> : null}
        {requests.data && rows.length === 0 ? (
          <EmptyState title={filter === "ALL" ? "No authorization requests yet." : `No ${DECISION_LABEL[filter as Decision].toLowerCase()} decisions yet.`}>
            Requests are made by an agent from its mandate&apos;s page.
          </EmptyState>
        ) : null}
        <ul className="grid gap-2">{rows.map((r) => <RequestRow key={r.request_id} r={r} />)}</ul>
      </section>
    </>
  );
}

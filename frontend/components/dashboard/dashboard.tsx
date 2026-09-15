"use client";

import { ArrowRight, FilePlus2 } from "lucide-react";
import Link from "next/link";

import { ActivityList } from "@/components/dashboard/activity-list";
import { EmptyState, LoadError, PageHeader } from "@/components/dashboard/empty-state";
import { RequestRow } from "@/components/decision/request-row";
import { MandateRow } from "@/components/mandate/mandate-card";
import { LinkButton } from "@/components/ui/link-button";
import { Skeleton } from "@/components/ui/skeleton";
import { useContractActivity } from "@/hooks/use-activity";
import { useMandates, useNow, useProtocol, useRequests } from "@/hooks/use-mandate-data";
import { mandateState } from "@/lib/utils/present";

function Stat({ label, value, hint, tone = "text-text" }: { label: string; value: number | string | undefined; hint: string; tone?: string }) {
  return (
    <div className="grid gap-1 rounded-lg border border-line bg-well p-4">
      <span className="eyebrow">{label}</span>
      {value === undefined ? <Skeleton className="h-8 w-12" /> : <span className={`figure text-3xl font-semibold ${tone}`}>{value}</span>}
      <span className="text-xs text-dim">{hint}</span>
    </div>
  );
}

export function Dashboard() {
  const now = useNow();
  const protocol = useProtocol();
  const mandates = useMandates(50);
  const requests = useRequests(10);
  const activity = useContractActivity();

  const active = mandates.data ? mandates.data.items.filter((m) => mandateState(m, now) === "ACTIVE").length : undefined;
  const pending = activity.data ? activity.data.filter((t) => t.method === "request_authorization" && (t.phase === "pending" || t.phase === "consensus")).length : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Authorization that expires when reality changes"
        actions={
          <LinkButton href="/mandates/new">
            <FilePlus2 data-icon="inline-start" /> New mandate
          </LinkButton>
        }
      >
        A principal grants an agent a mandate with hard limits and real-world conditions. Every time the agent asks to
        act, GenLayer validators read the evidence again and the contract decides: authorized, denied, or reassess
        required.
      </PageHeader>

      {protocol.error ? <LoadError what="the MANDATE contract" error={protocol.error} /> : null}

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active mandates" value={active} hint="Not revoked and not past expiry" />
        <Stat label="Pending assessments" value={pending} hint="Requests still in GenLayer consensus" />
        <Stat label="Authorized actions" value={protocol.data?.authorized_total} hint="Decisions recorded as authorized" tone="text-yes" />
        <Stat label="Reassessments" value={protocol.data?.reassess_total} hint="Decisions recorded as reassess required" tone="text-maybe" />
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="recent-decisions" className="grid content-start gap-3">
          <div className="flex items-center justify-between">
            <h2 id="recent-decisions" className="text-base font-semibold">Recent decisions</h2>
            <Link href="/requests" className="inline-flex items-center gap-1 text-sm text-signal hover:text-signal-hover">
              All requests <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {requests.isLoading ? <Skeleton className="h-20" /> : null}
          {requests.error ? <LoadError what="recent decisions" error={requests.error} /> : null}
          {requests.data && requests.data.items.length === 0 ? (
            <EmptyState title="No authorization requests yet.">
              When an agent asks to act under a mandate, the contract records the decision here.
            </EmptyState>
          ) : null}
          <ul className="grid gap-2">
            {requests.data?.items.slice(0, 6).map((r) => <RequestRow key={r.request_id} r={r} />)}
          </ul>
        </section>

        <section aria-labelledby="recent-mandates" className="grid content-start gap-3">
          <div className="flex items-center justify-between">
            <h2 id="recent-mandates" className="text-base font-semibold">Mandate activity</h2>
            <Link href="/mandates" className="inline-flex items-center gap-1 text-sm text-signal hover:text-signal-hover">
              All mandates <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {mandates.isLoading ? <Skeleton className="h-20" /> : null}
          {mandates.error ? <LoadError what="mandates" error={mandates.error} /> : null}
          {mandates.data && mandates.data.items.length === 0 ? (
            <EmptyState
              title="No mandates yet."
              action={
                <LinkButton variant="outline" href="/mandates/new">
                  Create a mandate
                </LinkButton>
              }
            >
              Create a mandate to define what an autonomous agent is allowed to do.
            </EmptyState>
          ) : null}
          <ul className="grid gap-2">
            {mandates.data?.items.slice(0, 6).map((m) => <MandateRow key={m.mandate_id} m={m} now={now} />)}
          </ul>
        </section>
      </div>

      <section aria-labelledby="recent-requests" className="mt-10 grid gap-3">
        <div className="flex items-center justify-between">
          <h2 id="recent-requests" className="text-base font-semibold">Recent authorization requests on chain</h2>
          <Link href="/activity" className="inline-flex items-center gap-1 text-sm text-signal hover:text-signal-hover">
            Activity <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <p className="text-sm text-dim">
          Transactions sent to the contract, as GenLayer reports them, including requests still in consensus.
        </p>
        {activity.error ? <LoadError what="contract transactions" error={activity.error} /> : null}
        {activity.data && activity.data.filter((t) => t.method === "request_authorization").length === 0 ? (
          <EmptyState title="No requests have been sent to the contract yet." />
        ) : null}
        <ActivityList filter="request_authorization" limit={5} />
      </section>
    </>
  );
}

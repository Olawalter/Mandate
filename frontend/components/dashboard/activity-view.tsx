"use client";

import { ActivityList } from "@/components/dashboard/activity-list";
import { EmptyState, LoadError, PageHeader } from "@/components/dashboard/empty-state";
import { useContractActivity } from "@/hooks/use-activity";

export function ActivityView() {
  const q = useContractActivity();
  return (
    <>
      <PageHeader eyebrow="Activity" title="Contract activity">
        The most recent transactions GenLayer reports for the MANDATE contract, decoded from their own calldata. Status
        is GenLayer&apos;s: accepted transactions can still be appealed until they are finalized.
      </PageHeader>
      {q.error ? <LoadError what="contract transactions" error={q.error} /> : null}
      {q.data && q.data.length === 0 ? <EmptyState title="No transactions have been sent to the contract yet." /> : null}
      <ActivityList />
    </>
  );
}

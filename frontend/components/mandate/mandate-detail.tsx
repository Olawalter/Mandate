"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { RequestPanel } from "@/components/authorization/request-panel";
import { EmptyState, LoadError } from "@/components/dashboard/empty-state";
import { RequestRow } from "@/components/decision/request-row";
import { StateDot } from "@/components/mandate/mandate-card";
import { PrincipalActions } from "@/components/mandate/principal-actions";
import { TermsSummary } from "@/components/mandate/terms-summary";
import { Skeleton } from "@/components/ui/skeleton";
import { useMandate, useMandateRequests, useMandateVersion, useNow } from "@/hooks/use-mandate-data";
import { isMissing } from "@/lib/genlayer/mandate";
import { ACTION_LABEL, formatAmount, formatTime, mandateState, shortAddress } from "@/lib/utils/present";
import { useMandateApp } from "@/providers/app-providers";

export function MandateDetail({ id }: { id: string }) {
  const now = useNow();
  const { config } = useMandateApp();
  const mandate = useMandate(id);
  const requests = useMandateRequests(id);
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const m = mandate.data;
  const shownVersion = viewVersion ?? m?.version;
  const version = useMandateVersion(id, shownVersion !== m?.version ? shownVersion : undefined);

  if (mandate.isLoading) return <Skeleton className="h-64" />;
  if (mandate.error) {
    return isMissing(mandate.error) ? (
      <EmptyState title={`Mandate #${id} does not exist.`} action={<Link className="text-signal" href="/mandates">Back to mandates</Link>}>
        The contract has no mandate with this number.
      </EmptyState>
    ) : (
      <LoadError what={`mandate #${id}`} error={mandate.error} />
    );
  }
  if (!m) return null;

  const state = mandateState(m, now);
  const terms = shownVersion === m.version ? m.terms : version.data;

  return (
    <>
      <Link href="/mandates" className="mb-5 inline-flex items-center gap-1 text-sm text-dim hover:text-text">
        <ArrowLeft className="size-3.5" /> Mandates
      </Link>

      <header className="mb-8 grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="figure text-sm text-dim">Mandate #{m.mandate_id}</span>
          <StateDot state={state} />
          <span className="rounded-md border border-line px-2 py-0.5 text-xs text-dim">Version {m.version}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {ACTION_LABEL[m.terms.action_type]} {m.terms.target}
        </h1>
        <p className="text-sm text-dim">
          Up to <span className="figure text-text">{formatAmount(m.terms.max_amount, m.terms.currency)}</span> by{" "}
          <span className="text-text">{m.terms.agent_label || shortAddress(m.agent)}</span>, until{" "}
          <span className="figure text-text">{formatTime(m.terms.expires_at)}</span>.
        </p>
        {state === "EXPIRED" ? (
          <p className="text-sm text-maybe">This mandate has expired. Requests are denied until the principal issues a new version.</p>
        ) : null}
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 content-start gap-8">
          <section aria-labelledby="terms-title" className="rounded-lg border border-line bg-well p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <h2 id="terms-title" className="text-base font-semibold">Terms</h2>
              <label className="flex items-center gap-2 text-sm text-dim">
                Version
                <select
                  className="rounded-md border border-line bg-ink px-2 py-1 text-text"
                  value={shownVersion}
                  onChange={(e) => setViewVersion(Number(e.target.value))}
                >
                  {Array.from({ length: m.version }, (_, i) => m.version - i).map((v) => (
                    <option key={v} value={v}>
                      {v}
                      {v === m.version ? " (current)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {shownVersion !== m.version ? (
              <p className="mb-2 text-xs text-maybe">
                Showing version {shownVersion}, which is no longer current. Decisions made under it stay bound to it.
              </p>
            ) : null}
            {terms ? (
              <TermsSummary
                principal={m.principal}
                t={{
                  agent: m.agent,
                  agentLabel: terms.agent_label,
                  actionType: terms.action_type,
                  target: terms.target,
                  maxAmount: terms.max_amount,
                  currency: terms.currency,
                  expiresAt: terms.expires_at,
                  intendedUse: terms.intended_use,
                  conditions: terms.conditions,
                  sources: terms.sources,
                }}
              />
            ) : version.error ? (
              <LoadError what={`version ${shownVersion}`} error={version.error} />
            ) : (
              <Skeleton className="h-40" />
            )}
            <p className="mt-3 text-xs text-dim">
              Version created {terms ? formatTime(terms.created_at) : "…"}.{" "}
              {m.baseline_snapshot_id
                ? `The current version was last authorized with evidence snapshot #${m.baseline_snapshot_id}; later requests are compared against it.`
                : "The current version has not been authorized yet, so there is no earlier evidence to compare against."}
            </p>
          </section>

          <section aria-labelledby="history-title" className="grid gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="history-title" className="text-base font-semibold">Decisions under this mandate</h2>
              <span className="figure text-xs text-dim">
                {m.authorized_count} authorized · {m.denied_count} denied · {m.reassess_count} reassess
              </span>
            </div>
            {requests.isLoading ? <Skeleton className="h-16" /> : null}
            {requests.error ? <LoadError what="this mandate's requests" error={requests.error} /> : null}
            {requests.data && requests.data.items.length === 0 ? (
              <EmptyState title="No requests yet.">The agent has not asked to act under this mandate.</EmptyState>
            ) : null}
            <ul className="grid gap-2">{requests.data?.items.map((r) => <RequestRow key={r.request_id} r={r} />)}</ul>
          </section>
        </div>

        <aside className="grid content-start gap-6 lg:sticky lg:top-20">
          <RequestPanel mandate={m} now={now} />
          <PrincipalActions key={`${m.version}-${m.status}`} mandate={m} now={now} />
          <a
            href={`${config.explorer}/address/${config.contractAddress}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-dim hover:text-signal"
          >
            Verify this mandate on the GenLayer explorer
          </a>
        </aside>
      </div>
    </>
  );
}

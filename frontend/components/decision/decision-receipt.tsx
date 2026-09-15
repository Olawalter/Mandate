"use client";

import { ArrowLeft, Check, ExternalLink, RotateCcw, X } from "lucide-react";
import Link from "next/link";

import { PreflightList } from "@/components/authorization/preflight-list";
import { EmptyState, LoadError } from "@/components/dashboard/empty-state";
import { DECISION_TONE, DecisionBadge } from "@/components/decision/decision-badge";
import { SnapshotPanel } from "@/components/evidence/snapshot-panel";
import { LinkButton } from "@/components/ui/link-button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDecisionTransaction } from "@/hooks/use-activity";
import { useFinalReceipt, useReceipt } from "@/hooks/use-mandate-data";
import { isMissing } from "@/lib/genlayer/mandate";
import { PHASE_LABEL } from "@/lib/genlayer/transactions";
import {
  ACTION_LABEL,
  CHECK_LABEL,
  CONDITION_LABEL,
  DECISION_SUMMARY,
  formatAmount,
  formatTime,
  reasonText,
  shortHash,
} from "@/lib/utils/present";
import { useMandateApp } from "@/providers/app-providers";
import type { Receipt } from "@/types/mandate";

function Line({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid gap-0.5 border-b border-dashed border-line py-2.5 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs tracking-wide text-dim uppercase">{label}</dt>
      <dd className={`min-w-0 text-sm break-words ${mono ? "font-mono" : ""}`}>{children}</dd>
    </div>
  );
}

/** The conditions a receipt can vouch for, each taken from a stored field. */
function conditionLines(rec: Receipt) {
  const r = rec.request;
  const by = Object.fromEntries(r.preflight.map((c) => [c.check, c.passed]));
  const lines: { label: string; ok: boolean | null }[] = [
    { label: CHECK_LABEL.agent_matches_mandate, ok: by.agent_matches_mandate },
    { label: CHECK_LABEL.mandate_active, ok: by.mandate_active },
    { label: CHECK_LABEL.mandate_not_expired, ok: by.mandate_not_expired },
    { label: CHECK_LABEL.version_current, ok: by.version_current },
    { label: CHECK_LABEL.action_permitted, ok: by.action_permitted },
    { label: CHECK_LABEL.target_permitted, ok: by.target_permitted },
    { label: CHECK_LABEL.amount_within_limit, ok: by.amount_within_limit },
  ];
  if (rec.snapshot) {
    for (const c of rec.snapshot.conditions) {
      lines.push({ label: CONDITION_LABEL[c.key], ok: c.finding === "SATISFIED" ? true : c.finding === "VIOLATED" ? false : null });
    }
    lines.push({ label: rec.snapshot.material_change ? "Material change detected" : "No material change", ok: !rec.snapshot.material_change });
  }
  return lines;
}

export function DecisionReceipt({ id }: { id: string }) {
  const { config } = useMandateApp();
  const receipt = useReceipt(id);
  const final = useFinalReceipt(id);
  const rec = receipt.data;
  const tx = useDecisionTransaction(rec?.request);

  if (receipt.isLoading) return <Skeleton className="h-96" />;
  if (receipt.error) {
    return isMissing(receipt.error) ? (
      <EmptyState title={`Request #${id} does not exist.`} action={<Link className="text-signal" href="/requests">All requests</Link>}>
        The contract has no decision recorded with this number. A request still in consensus has no record yet.
      </EmptyState>
    ) : (
      <LoadError what={`decision #${id}`} error={receipt.error} />
    );
  }
  if (!rec) return null;

  const r = rec.request;
  const t = rec.mandate_terms;
  const tone = DECISION_TONE[r.decision];
  const isFinal = !!final.data && final.data.request.decision === r.decision;
  const reassess = r.decision === "REASSESS_REQUIRED";
  const fresh = `/mandates/${r.mandate_id}?action=${encodeURIComponent(r.action_type)}&target=${encodeURIComponent(r.target)}&amount=${r.amount}`;

  return (
    <>
      <Link href={`/mandates/${r.mandate_id}`} className="mb-5 inline-flex items-center gap-1 text-sm text-dim hover:text-text">
        <ArrowLeft className="size-3.5" /> Mandate #{r.mandate_id}
      </Link>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <article aria-labelledby="receipt-title" className="min-w-0 overflow-hidden rounded-lg border border-line bg-well">
          <div className={`perforated h-2 ${tone.bg}`} />
          <header className={`grid gap-4 border-b border-line p-5 sm:p-6 ${tone.bg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 id="receipt-title" className="font-mono text-xs font-semibold tracking-[0.2em] text-dim uppercase">
                Mandate decision
              </h1>
              <span className="figure text-xs text-dim">
                Mandate #{r.mandate_id} · Version {r.mandate_version} · Request #{r.request_id}
              </span>
            </div>
            <DecisionBadge decision={r.decision} size="lg" />
            <p className="text-sm text-text">{DECISION_SUMMARY[r.decision]}</p>
            <p className={`text-sm ${tone.text}`}>{reasonText(r.reason_code)}</p>
          </header>

          {reassess ? (
            <section className="grid gap-3 border-b border-maybe/40 bg-maybe/10 p-5 sm:p-6" aria-label="Reassessment">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="eyebrow">Material change</dt>
                  <dd className="mt-1 font-medium text-maybe">{r.material_change ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Affected condition</dt>
                  <dd className="mt-1">
                    {r.affected_conditions.length ? r.affected_conditions.map((k) => CONDITION_LABEL[k]).join(", ") : "None changed; evidence could not be relied upon"}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">Evidence snapshot</dt>
                  <dd className="figure mt-1">#{r.snapshot_id}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Evaluation time</dt>
                  <dd className="figure mt-1 text-xs">{rec.snapshot ? formatTime(rec.snapshot.evaluated_at) : formatTime(r.submitted_at)}</dd>
                </div>
              </dl>
              <LinkButton className="w-fit" href={fresh}>
                <RotateCcw data-icon="inline-start" /> Request fresh assessment
              </LinkButton>
              <p className="text-xs text-dim">
                A fresh assessment reads the evidence again. It authorizes only if the conditions hold again; the principal
                can also issue a new version of the mandate.
              </p>
            </section>
          ) : null}

          <dl className="px-5 py-3 sm:px-6">
            <Line label="Principal" mono>{r.principal}</Line>
            <Line label="Agent" mono>
              {t.agent_label ? <span className="mb-0.5 block font-sans">{t.agent_label}</span> : null}
              {r.agent}
            </Line>
            <Line label="Action">{ACTION_LABEL[r.action_type] ?? r.action_type}</Line>
            <Line label="Target">{r.target}</Line>
            <Line label="Amount" mono>
              {formatAmount(r.amount, r.currency)}{" "}
              <span className="text-xs text-dim">of up to {formatAmount(t.max_amount, t.currency)}</span>
            </Line>
            <Line label="Submitted" mono>{formatTime(r.submitted_at)}</Line>
            <Line label="Request key" mono>{r.request_key}</Line>
            {r.requested_version !== r.mandate_version ? <Line label="Version named">{r.requested_version}</Line> : null}
          </dl>

          <section className="border-t border-line px-5 py-4 sm:px-6" aria-labelledby="conditions-title">
            <h2 id="conditions-title" className="eyebrow mb-3">Conditions</h2>
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
              {conditionLines(rec).map((l) => (
                <li key={l.label} className="flex items-center gap-2">
                  {l.ok === true ? <Check className="size-4 text-yes" strokeWidth={2.5} /> : l.ok === false ? <X className="size-4 text-no" strokeWidth={2.5} /> : <span className="figure w-4 text-center text-maybe">?</span>}
                  <span className={l.ok === false ? "text-no" : l.ok === null ? "text-maybe" : ""}>{l.label}</span>
                </li>
              ))}
            </ul>
            {!r.assessed ? (
              <p className="mt-3 text-xs text-dim">A hard limit failed, so no evidence was read and no snapshot was taken.</p>
            ) : null}
          </section>

          <section className="border-t border-line px-5 py-4 sm:px-6" aria-labelledby="snapshot-title">
            <h2 id="snapshot-title" className="eyebrow mb-3">Evidence snapshot</h2>
            {rec.snapshot ? <SnapshotPanel snapshot={rec.snapshot} terms={t} /> : <p className="text-sm text-dim">None. The decision needed no evidence.</p>}
          </section>

          <footer className="grid gap-2 border-t border-dashed border-line px-5 py-4 text-xs text-dim sm:px-6">
            <p>
              Reconstructed from the MANDATE Intelligent Contract&apos;s own state (
              <span className="font-mono">get_decision_receipt</span>). Nothing on this receipt was produced by this interface.
            </p>
          </footer>
        </article>

        <aside className="grid content-start gap-4 lg:sticky lg:top-20">
          <section className="rounded-lg border border-line bg-well p-5" aria-labelledby="lifecycle-title">
            <h2 id="lifecycle-title" className="mb-3 text-base font-semibold">Decision lifecycle</h2>
            <ol className="grid gap-2 text-sm">
              <li className="flex items-center gap-2"><Check className="size-4 text-signal" /> Submitted {formatTime(r.submitted_at)}</li>
              <li className="flex items-center gap-2">
                <Check className="size-4 text-signal" /> {r.assessed ? "Evidence assessed by GenLayer consensus" : "Decided by deterministic preflight"}
              </li>
              <li className="flex items-center gap-2"><Check className="size-4 text-signal" /> Decision recorded on-chain</li>
              <li className="flex items-center gap-2">
                {isFinal ? <Check className="size-4 text-yes" /> : <span className="size-4 animate-pulse rounded-full border border-maybe" />}
                {isFinal ? "Finalized: present in final contract state" : "Accepted, not yet final"}
              </li>
            </ol>
            <dl className="mt-4 grid gap-2 border-t border-line pt-3 text-xs">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-dim">Consensus transaction</dt>
                <dd>
                  {tx.data ? (
                    <a href={`${config.explorer}/tx/${tx.data.hash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono hover:text-signal">
                      {shortHash(tx.data.hash)} <ExternalLink className="size-3" />
                    </a>
                  ) : tx.isLoading ? (
                    "Looking up…"
                  ) : (
                    "Not found in recent transactions"
                  )}
                </dd>
              </div>
              {tx.data ? (
                <>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-dim">GenLayer status</dt>
                    <dd>{PHASE_LABEL[tx.data.phase]}</dd>
                  </div>
                  {tx.data.consensus ? (
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt className="text-dim">Consensus result</dt>
                      <dd className="font-mono">{tx.data.consensus}</dd>
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-dim">Final state read</dt>
                <dd>{final.isLoading ? "Checking…" : isFinal ? "Matches this decision" : "Not final yet"}</dd>
              </div>
            </dl>
          </section>
          <section className="rounded-lg border border-line bg-well p-5 text-sm">
            <h2 className="mb-2 text-base font-semibold">Deterministic preflight</h2>
            <PreflightList checks={r.preflight} columns={1} />
          </section>
          <p className="text-xs text-dim">
            Contract{" "}
            <a className="font-mono hover:text-signal" href={`${config.explorer}/address/${config.contractAddress}`} target="_blank" rel="noreferrer">
              {shortHash(config.contractAddress)}
            </a>{" "}
            on {config.networkName}.
          </p>
        </aside>
      </div>
    </>
  );
}

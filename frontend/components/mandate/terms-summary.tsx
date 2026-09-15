import { ExternalLink } from "lucide-react";

import {
  ACTION_LABEL,
  CONDITION_LABEL,
  PURPOSE_LABEL,
  formatAmount,
  formatTime,
  shortAddress,
} from "@/lib/utils/present";
import type { ConditionKey, SourcePurpose } from "@/types/mandate";

export type SummaryTerms = {
  agent: string;
  agentLabel: string;
  actionType: string;
  target: string;
  maxAmount: number;
  currency: string;
  expiresAt: number;
  intendedUse: string;
  conditions: { key: string; requirement: string }[];
  sources: { url: string; purpose: string }[];
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line py-3 last:border-b-0 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-dim">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/** A mandate's terms in words — used for the review step and for any stored version. */
export function TermsSummary({ t, principal }: { t: SummaryTerms; principal?: string }) {
  return (
    <dl className="grid">
      {principal ? (
        <Row label="Principal">
          <span className="font-mono break-all">{principal}</span>
        </Row>
      ) : null}
      <Row label="Authorized agent">
        <span className="font-medium">{t.agentLabel || shortAddress(t.agent)}</span>
        <span className="mt-0.5 block font-mono text-xs break-all text-dim">{t.agent}</span>
      </Row>
      <Row label="Action">{ACTION_LABEL[t.actionType] ?? t.actionType}</Row>
      <Row label="Target">{t.target}</Row>
      <Row label="Maximum amount">
        <span className="figure">{formatAmount(t.maxAmount, t.currency)}</span>
      </Row>
      <Row label="Expires">
        <span className="figure">{formatTime(t.expiresAt)}</span>
      </Row>
      <Row label="Intended use">{t.intendedUse}</Row>
      <Row label="Conditions">
        <ul className="grid gap-2">
          {t.conditions.map((c) => (
            <li key={c.key}>
              <span className="font-medium">{CONDITION_LABEL[c.key as ConditionKey] ?? c.key}</span>
              <span className="block text-dim">{c.requirement}</span>
            </li>
          ))}
        </ul>
      </Row>
      <Row label="Evidence sources">
        <ul className="grid gap-2">
          {t.sources.map((s, i) => (
            <li key={`${s.url}-${i}`} className="grid gap-0.5">
              <span className="text-xs text-dim">
                S{i + 1} · {PURPOSE_LABEL[s.purpose as SourcePurpose] ?? s.purpose}
              </span>
              <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs break-all hover:text-signal">
                {s.url} <ExternalLink className="size-3 shrink-0" />
              </a>
            </li>
          ))}
        </ul>
      </Row>
    </dl>
  );
}

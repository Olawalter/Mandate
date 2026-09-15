import { CircleCheck, CircleHelp, CircleX, ExternalLink } from "lucide-react";

import { CONDITION_LABEL, FINDING_LABEL, PURPOSE_LABEL, formatTime } from "@/lib/utils/present";
import type { Finding, Snapshot, Terms } from "@/types/mandate";

const FINDING_STYLE: Record<Finding, { icon: typeof CircleCheck; tone: string }> = {
  SATISFIED: { icon: CircleCheck, tone: "text-yes" },
  VIOLATED: { icon: CircleX, tone: "text-no" },
  UNVERIFIED: { icon: CircleHelp, tone: "text-maybe" },
};

/**
 * An evidence snapshot exactly as the contract stored it: per condition, the
 * agreed finding, the source it came from and the quote every validator found
 * in its own fetch of that source.
 */
export function SnapshotPanel({ snapshot, terms }: { snapshot: Snapshot; terms?: Terms }) {
  const requirement = (key: string) => terms?.conditions.find((c) => c.key === key)?.requirement;
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="eyebrow">Snapshot</dt>
          <dd className="figure mt-1">#{snapshot.snapshot_id}</dd>
        </div>
        <div>
          <dt className="eyebrow">Evaluated</dt>
          <dd className="figure mt-1 text-xs">{formatTime(snapshot.evaluated_at)}</dd>
        </div>
        <div>
          <dt className="eyebrow">Sources read</dt>
          <dd className="figure mt-1">
            {snapshot.sources.filter((s) => s.readable).length} of {snapshot.source_count}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Material change</dt>
          <dd className={`mt-1 font-medium ${snapshot.material_change ? "text-maybe" : "text-text"}`}>
            {snapshot.material_change ? "Yes" : "No"}
          </dd>
        </div>
      </dl>

      <ul className="grid gap-2">
        {snapshot.conditions.map((c) => {
          const { icon: Icon, tone } = FINDING_STYLE[c.finding];
          const affected = snapshot.affected_conditions.includes(c.key);
          return (
            <li key={c.key} className={`rounded-md border p-3 ${affected ? "border-maybe/50 bg-maybe/5" : "border-line bg-ink/40"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Icon className={`size-4 ${tone}`} />
                <span className="text-sm font-medium">{CONDITION_LABEL[c.key]}</span>
                <span className={`text-xs ${tone}`}>{FINDING_LABEL[c.finding]}</span>
                {affected ? <span className="rounded border border-maybe/50 px-1.5 text-[11px] text-maybe">Changed since authorization</span> : null}
              </div>
              {requirement(c.key) ? <p className="mt-1 text-xs text-dim">Requirement: {requirement(c.key)}</p> : null}
              {c.quote ? (
                <blockquote className="mt-2 border-l-2 border-signal/60 pl-3 text-sm text-text">
                  “{c.quote}” <span className="figure text-xs text-dim">({c.source})</span>
                </blockquote>
              ) : (
                <p className="mt-2 text-xs text-dim">No passage in the evidence settled this condition.</p>
              )}
            </li>
          );
        })}
      </ul>

      <ul className="grid gap-1.5 text-xs">
        {snapshot.sources.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="figure text-dim">{s.id}</span>
            <span className="text-dim">{PURPOSE_LABEL[s.purpose]}</span>
            <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 break-all text-text hover:text-signal">
              {s.url}
              <ExternalLink className="size-3 shrink-0" />
            </a>
            <span className={s.readable ? "text-yes" : "text-no"}>{s.readable ? "read" : "unreadable"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

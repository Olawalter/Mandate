import { ChevronRight } from "lucide-react";
import Link from "next/link";

import {
  ACTION_LABEL,
  MANDATE_STATE_LABEL,
  formatAmount,
  formatDate,
  mandateState,
  shortAddress,
} from "@/lib/utils/present";
import type { Mandate } from "@/types/mandate";

export function StateDot({ state }: { state: "ACTIVE" | "EXPIRED" | "REVOKED" }) {
  const tone = state === "ACTIVE" ? "bg-signal" : state === "EXPIRED" ? "bg-dim" : "bg-no";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-dim">
      <span className={`size-1.5 rounded-full ${tone}`} aria-hidden="true" />
      {MANDATE_STATE_LABEL[state]}
    </span>
  );
}

export function MandateRow({ m, now }: { m: Mandate; now: number }) {
  const state = mandateState(m, now);
  return (
    <li>
      <Link
        href={`/mandates/${m.mandate_id}`}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-lg border border-line bg-well px-4 py-3.5 transition-colors hover:border-signal/60"
      >
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="figure text-xs text-dim">#{m.mandate_id}</span>
            <StateDot state={state} />
          </div>
          <p className="font-medium break-words">
            {ACTION_LABEL[m.terms.action_type]} · {m.terms.target}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
            <span>
              Up to <span className="figure text-text">{formatAmount(m.terms.max_amount, m.terms.currency)}</span>
            </span>
            <span>
              Agent <span className="figure text-text">{m.terms.agent_label || shortAddress(m.agent)}</span>
            </span>
            <span>Version {m.version}</span>
            <span>{state === "EXPIRED" ? "Expired" : "Expires"} {formatDate(m.terms.expires_at)}</span>
          </div>
        </div>
        <ChevronRight className="size-4 text-dim" />
      </Link>
    </li>
  );
}

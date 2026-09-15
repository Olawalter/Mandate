import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { DecisionBadge } from "@/components/decision/decision-badge";
import { formatTime, reasonText, requestTitle } from "@/lib/utils/present";
import type { AuthorizationRequest } from "@/types/mandate";

export function RequestRow({ r }: { r: AuthorizationRequest }) {
  return (
    <li>
      <Link
        href={`/decisions/${r.request_id}`}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-lg border border-line bg-well px-4 py-3.5 transition-colors hover:border-signal/60"
      >
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="figure text-xs text-dim">Request #{r.request_id}</span>
            <DecisionBadge decision={r.decision} />
          </div>
          <p className="text-sm font-medium break-words">{requestTitle(r)}</p>
          <p className="text-xs text-dim">
            Mandate #{r.mandate_id} v{r.mandate_version} · {formatTime(r.submitted_at)} · {reasonText(r.reason_code)}
          </p>
        </div>
        <ChevronRight className="size-4 text-dim" />
      </Link>
    </li>
  );
}

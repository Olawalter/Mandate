import { CircleCheck, CircleX, RotateCcw } from "lucide-react";

import { DECISION_LABEL } from "@/lib/utils/present";
import type { Decision } from "@/types/mandate";

export const DECISION_TONE: Record<Decision, { text: string; border: string; bg: string; dot: string }> = {
  AUTHORIZED: { text: "text-yes", border: "border-yes/40", bg: "bg-yes/10", dot: "bg-yes" },
  DENIED: { text: "text-no", border: "border-no/40", bg: "bg-no/10", dot: "bg-no" },
  REASSESS_REQUIRED: { text: "text-maybe", border: "border-maybe/50", bg: "bg-maybe/10", dot: "bg-maybe" },
};

const ICON = { AUTHORIZED: CircleCheck, DENIED: CircleX, REASSESS_REQUIRED: RotateCcw } as const;

export function DecisionBadge({ decision, size = "sm" }: { decision: Decision; size?: "sm" | "lg" }) {
  const tone = DECISION_TONE[decision];
  const Icon = ICON[decision];
  if (size === "lg") {
    return (
      <span className={`inline-flex items-center gap-2.5 rounded-md border px-3.5 py-2 ${tone.border} ${tone.bg} ${tone.text}`}>
        <Icon className="size-5" />
        <span className="font-mono text-lg font-semibold tracking-[0.06em] uppercase">{DECISION_LABEL[decision]}</span>
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${tone.border} ${tone.bg} ${tone.text}`}>
      <Icon className="size-3.5" />
      {DECISION_LABEL[decision]}
    </span>
  );
}

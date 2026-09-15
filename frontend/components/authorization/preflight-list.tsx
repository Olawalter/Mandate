import { Check, X } from "lucide-react";

import { CHECK_LABEL } from "@/lib/utils/present";
import type { PreflightCheck } from "@/types/mandate";

export function PreflightList({ checks, columns = 2 }: { checks: { check: PreflightCheck; passed: boolean }[]; columns?: 1 | 2 }) {
  return (
    <ul className={`grid gap-1.5 text-sm ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
      {checks.map((c) => (
        <li key={c.check} className="flex items-center gap-2">
          {c.passed ? <Check className="size-4 text-yes" strokeWidth={2.5} /> : <X className="size-4 text-no" strokeWidth={2.5} />}
          <span className={c.passed ? "text-text" : "text-no"}>{CHECK_LABEL[c.check]}</span>
        </li>
      ))}
    </ul>
  );
}

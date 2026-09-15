"use client";

import { ArrowRight, Check, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { TxLifecycle } from "@/components/authorization/tx-lifecycle";
import { STEP_LABEL, STEPS, lifecycle } from "@/lib/genlayer/lifecycle";
import type { TxRecord } from "@/providers/tx-provider";

function currentStep(r: TxRecord): string {
  if (r.state.stage === "FAILED") return "Failed";
  const steps = lifecycle(r.state);
  const now = STEPS.find((s) => steps[s] === "current");
  if (!now) return STEPS.every((s) => steps[s] === "done") ? "Finalized" : "Starting";
  return now === "finalized" ? "Decision recorded, not yet final" : STEP_LABEL[now];
}

/**
 * Every write of this session, docked above the router so navigation never
 * hides one. Each write is a one-line pill by default — small enough not to
 * cover the page's own buttons — and expands to the full lifecycle.
 */
export function TxDock({ records, onDismiss }: { records: TxRecord[]; onDismiss: (id: number) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const visible = records.filter((r) => !r.dismissed);
  if (!visible.length) return null;
  return (
    <section aria-label="Transactions" className="fixed right-4 bottom-4 z-50 grid max-h-[70vh] w-[min(360px,calc(100vw-2rem))] gap-2 overflow-y-auto">
      {visible.map((r) => {
        const failed = r.state.stage === "FAILED";
        const settled = r.state.stage === "CONTRACT_STATE_UPDATED" || failed;
        const expanded = open === r.id || failed;
        return (
          <article key={r.id} className={`rounded-lg border bg-surface ${failed ? "border-no/50" : "border-line"}`}>
            <header className="flex items-center gap-2 px-3 py-2.5">
              <span className="shrink-0">
                {failed ? <X className="size-4 text-no" /> : settled ? <Check className="size-4 text-signal" /> : <Loader2 className="size-4 animate-spin text-signal" />}
              </span>
              <button
                type="button"
                className="grid min-w-0 flex-1 text-left"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : r.id)}
              >
                <span className="truncate text-sm font-medium">{r.title}</span>
                <span className="text-xs text-dim">{currentStep(r)}</span>
              </button>
              <button type="button" aria-label={expanded ? "Collapse" : "Expand"} className="text-dim hover:text-text" onClick={() => setOpen(expanded ? null : r.id)}>
                {expanded ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
              </button>
              {settled ? (
                <button type="button" aria-label="Dismiss" className="text-dim hover:text-text" onClick={() => onDismiss(r.id)}>
                  <X className="size-4" />
                </button>
              ) : null}
            </header>
            {expanded ? (
              <div className="border-t border-line px-3 py-3">
                <TxLifecycle state={r.state} effect={r.effect} compact />
              </div>
            ) : null}
            {r.href ? (
              <Link href={r.href} className="flex items-center gap-1 border-t border-line px-3 py-2 text-sm font-medium text-signal hover:text-signal-hover">
                Open result <ArrowRight className="size-3.5" />
              </Link>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}

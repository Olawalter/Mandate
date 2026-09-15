"use client";

import { Check, Circle, ExternalLink, Loader2, X } from "lucide-react";

import { STEP_HINT, STEP_LABEL, STEPS, lifecycle } from "@/lib/genlayer/lifecycle";
import type { TxState } from "@/lib/genlayer/tx";
import { shortHash } from "@/lib/utils/present";
import { useMandateApp } from "@/providers/app-providers";

/**
 * One rung per observed fact. A rung is ticked only when reached; the current
 * rung spins; a failure marks the rung it stopped on. Finalized is its own
 * rung because an accepted decision can still be appealed.
 */
export function TxLifecycle({ state, effect, compact = false }: { state: TxState; effect?: string; compact?: boolean }) {
  const { config } = useMandateApp();
  const steps = lifecycle(state);
  const done = state.stage === "CONTRACT_STATE_UPDATED";

  return (
    <div className="grid gap-3" aria-live="polite">
      <ol className={`grid gap-2 ${compact ? "text-xs" : "text-sm"}`}>
        {STEPS.map((s) => {
          const st = steps[s];
          return (
            <li key={s} className="flex items-start gap-2.5">
              <span
                className={`mt-px flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  st === "failed"
                    ? "border-no text-no"
                    : st === "done"
                      ? "border-signal bg-signal text-ink"
                      : st === "current"
                        ? "border-signal text-signal"
                        : "border-line text-line"
                }`}
              >
                {st === "failed" ? (
                  <X className="size-3" />
                ) : st === "done" ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : st === "current" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Circle className="size-1.5 fill-current" />
                )}
              </span>
              <span className="grid">
                <span className={st === "todo" ? "text-dim" : st === "failed" ? "text-no" : "text-text"}>{STEP_LABEL[s]}</span>
                {st === "current" && !compact ? <span className="text-xs text-dim">{STEP_HINT[s]}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>

      {state.stage === "FAILED" && state.message ? (
        <p role="alert" className="rounded-md border border-no/40 bg-no/10 px-3 py-2 text-sm text-text">
          {state.message.replace(/^\[(EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR)\]\s*/, "")}
        </p>
      ) : null}
      {done && effect ? <p className="text-sm text-text">{effect}</p> : null}
      {done && state.finality !== "finalized" ? (
        <p className="text-xs text-dim">Recorded and accepted. It becomes final when GenLayer closes the appeal window.</p>
      ) : null}

      {state.hash ? (
        <a
          className="inline-flex w-fit items-center gap-1 font-mono text-xs text-dim hover:text-signal"
          href={`${config.explorer}/tx/${state.hash}`}
          target="_blank"
          rel="noreferrer"
        >
          Transaction {shortHash(state.hash)}
          <ExternalLink className="size-3" />
        </a>
      ) : null}
    </div>
  );
}

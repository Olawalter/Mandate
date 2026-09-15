"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ACTION_LABEL, CONDITION_LABEL, PURPOSE_LABEL } from "@/lib/utils/present";
import { LIMITS, type MandateForm } from "@/lib/utils/validation";
import { ACTIONS, CONDITION_KEYS, SOURCE_PURPOSES, type ConditionKey, type SourcePurpose } from "@/types/mandate";

export const inputClass =
  "w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-text placeholder:text-dim/70 focus:border-signal focus:outline-none aria-invalid:border-no";

export function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-no">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-dim">{hint}</p>
      ) : null}
    </div>
  );
}

export const CONDITION_EXAMPLES: Record<ConditionKey, string> = {
  provider_eligible: "The provider is in good standing and not suspended.",
  service_available: "The provider's status page reports the service as operational.",
  terms_compatible: "The current terms allow business customers to buy this service.",
  intended_use_permitted: "The acceptable use policy permits the intended use.",
};

/** Unix seconds <-> the value of an <input type="datetime-local">, both in UTC. */
export function toUtcInput(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 16);
}
export function fromUtcInput(value: string): number {
  const ms = Date.parse(`${value}:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

type Setter = (patch: Partial<MandateForm>) => void;

export function AgentFields({ form, set, errors, lockedAgent }: { form: MandateForm; set: Setter; errors: Record<string, string>; lockedAgent?: boolean }) {
  return (
    <div className="grid gap-5">
      <Field label="Authorized agent wallet" htmlFor="agent" error={errors.agent} hint={lockedAgent ? "The agent is fixed for a mandate's life." : "Only this address will be able to request authorization."}>
        <input id="agent" className={`${inputClass} font-mono`} value={form.agent} disabled={lockedAgent} placeholder="0x…" aria-invalid={!!errors.agent} onChange={(e) => set({ agent: e.target.value })} />
      </Field>
      <Field label="Agent name" htmlFor="agentLabel" error={errors.agentLabel} hint="Optional. A label for people reading receipts.">
        <input id="agentLabel" className={inputClass} value={form.agentLabel} maxLength={LIMITS.agentLabel} placeholder="Procurement Agent" onChange={(e) => set({ agentLabel: e.target.value })} />
      </Field>
    </div>
  );
}

export function ActionFields({ form, set, errors }: { form: MandateForm; set: Setter; errors: Record<string, string> }) {
  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Action</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ACTIONS.map((a) => (
            <label key={a} className={`flex cursor-pointer items-center justify-center rounded-md border px-3 py-2.5 text-sm ${form.actionType === a ? "border-signal bg-signal/10" : "border-line hover:border-dim"}`}>
              <input type="radio" name="action" className="sr-only" checked={form.actionType === a} onChange={() => set({ actionType: a })} />
              {ACTION_LABEL[a]}
            </label>
          ))}
        </div>
        {errors.actionType ? <p className="text-xs text-no">{errors.actionType}</p> : null}
      </fieldset>
      <Field label="Intended use" htmlFor="intendedUse" error={errors.intendedUse} hint="What the agent will use it for. Validators judge conditions against this.">
        <textarea id="intendedUse" rows={3} className={inputClass} value={form.intendedUse} maxLength={LIMITS.intendedUse} placeholder="Run AI inference workloads for internal analytics" aria-invalid={!!errors.intendedUse} onChange={(e) => set({ intendedUse: e.target.value })} />
      </Field>
    </div>
  );
}

export function TargetFields({ form, set, errors }: { form: MandateForm; set: Setter; errors: Record<string, string> }) {
  return (
    <Field label="Target" htmlFor="target" error={errors.target} hint="The agent's request must name this target exactly (case and spacing aside).">
      <input id="target" className={inputClass} value={form.target} maxLength={LIMITS.target} placeholder="Northwind Compute capacity" aria-invalid={!!errors.target} onChange={(e) => set({ target: e.target.value })} />
    </Field>
  );
}

export function LimitFields({ form, set, errors }: { form: MandateForm; set: Setter; errors: Record<string, string> }) {
  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_120px]">
      <Field label="Maximum amount" htmlFor="maxAmount" error={errors.maxAmount}>
        <input id="maxAmount" inputMode="decimal" className={`${inputClass} font-mono`} value={form.maxAmount} placeholder="5000.00" aria-invalid={!!errors.maxAmount} onChange={(e) => set({ maxAmount: e.target.value })} />
      </Field>
      <Field label="Currency" htmlFor="currency" error={errors.currency}>
        <input id="currency" className={`${inputClass} font-mono uppercase`} value={form.currency} maxLength={3} aria-invalid={!!errors.currency} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Expiration (UTC)" htmlFor="expiresAt" error={errors.expiresAt} hint="Requests at or after this moment are denied. At most 366 days away.">
          <input id="expiresAt" type="datetime-local" className={`${inputClass} font-mono`} value={form.expiresAt ? toUtcInput(form.expiresAt) : ""} aria-invalid={!!errors.expiresAt} onChange={(e) => set({ expiresAt: fromUtcInput(e.target.value) })} />
        </Field>
      </div>
    </div>
  );
}

export function ConditionFields({ form, set, errors }: { form: MandateForm; set: Setter; errors: Record<string, string> }) {
  const chosen = new Set(form.conditions.map((c) => c.key));
  const toggle = (key: ConditionKey) => {
    if (chosen.has(key)) set({ conditions: form.conditions.filter((c) => c.key !== key) });
    else set({ conditions: [...form.conditions, { key, requirement: CONDITION_EXAMPLES[key] }] });
  };
  return (
    <div className="grid gap-3">
      <p className="text-sm text-dim">
        Choose the real-world conditions this authority depends on and say, in your own words, what must hold. GenLayer
        validators check each one against the evidence every time the agent asks.
      </p>
      {errors.conditions ? <p className="text-xs text-no">{errors.conditions}</p> : null}
      {CONDITION_KEYS.map((key) => {
        const i = form.conditions.findIndex((c) => c.key === key);
        const on = i >= 0;
        return (
          <div key={key} className={`rounded-md border p-3 ${on ? "border-signal/60" : "border-line"}`}>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
              <input type="checkbox" className="size-4 accent-[#22d3ee]" checked={on} onChange={() => toggle(key)} />
              {CONDITION_LABEL[key]}
            </label>
            {on ? (
              <div className="mt-2">
                <textarea
                  aria-label={`Requirement for ${CONDITION_LABEL[key]}`}
                  rows={2}
                  className={inputClass}
                  maxLength={LIMITS.requirement}
                  value={form.conditions[i].requirement}
                  aria-invalid={!!errors[`conditions.${i}.requirement`]}
                  onChange={(e) => set({ conditions: form.conditions.map((c, j) => (j === i ? { ...c, requirement: e.target.value } : c)) })}
                />
                {errors[`conditions.${i}.requirement`] ? <p className="mt-1 text-xs text-no">{errors[`conditions.${i}.requirement`]}</p> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function SourceFields({ form, set, errors }: { form: MandateForm; set: Setter; errors: Record<string, string> }) {
  const update = (i: number, patch: Partial<{ url: string; purpose: SourcePurpose }>) =>
    set({ sources: form.sources.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <div className="grid gap-3">
      <p className="text-sm text-dim">
        Public https pages or APIs the validators will fetch themselves: status pages, terms, policies. Choose sources no
        party to a request can quietly edit. The contract never stores the pages, only what validators agree they show.
      </p>
      {errors.sources ? <p className="text-xs text-no">{errors.sources}</p> : null}
      {form.sources.map((s, i) => (
        <div key={i} className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-start">
          <div>
            <input aria-label={`Source ${i + 1} URL`} className={`${inputClass} font-mono`} placeholder="https://status.example.com/api/v2/status.json" value={s.url} aria-invalid={!!errors[`sources.${i}.url`]} onChange={(e) => update(i, { url: e.target.value })} />
            {errors[`sources.${i}.url`] ? <p className="mt-1 text-xs text-no">{errors[`sources.${i}.url`]}</p> : null}
          </div>
          <select aria-label={`Source ${i + 1} purpose`} className={inputClass} value={s.purpose} onChange={(e) => update(i, { purpose: e.target.value as SourcePurpose })}>
            {SOURCE_PURPOSES.map((p) => (
              <option key={p} value={p}>
                {PURPOSE_LABEL[p]}
              </option>
            ))}
          </select>
          <Button variant="outline" size="icon" aria-label={`Remove source ${i + 1}`} disabled={form.sources.length === 1} onClick={() => set({ sources: form.sources.filter((_, j) => j !== i) })}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button variant="outline" className="w-fit" disabled={form.sources.length >= LIMITS.sources} onClick={() => set({ sources: [...form.sources, { url: "", purpose: "POLICY" }] })}>
        <Plus data-icon="inline-start" /> Add source
      </Button>
    </div>
  );
}

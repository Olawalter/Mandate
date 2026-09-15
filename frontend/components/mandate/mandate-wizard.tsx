"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useConnection } from "wagmi";

import { PageHeader } from "@/components/dashboard/empty-state";
import { blankForm, termsFromForm } from "@/components/mandate/mandate-form-model";
import {
  ActionFields,
  AgentFields,
  ConditionFields,
  LimitFields,
  SourceFields,
  TargetFields,
} from "@/components/mandate/terms-fields";
import { TermsSummary } from "@/components/mandate/terms-summary";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-mandate-data";
import { createCall, mandateCreated, reads } from "@/lib/genlayer/mandate";
import { formErrors, type MandateForm } from "@/lib/utils/validation";
import { useMandateApp } from "@/providers/app-providers";
import { useTx } from "@/providers/tx-provider";

const STEPS = [
  { id: "agent", label: "Agent", fields: ["agent", "agentLabel"] },
  { id: "action", label: "Action", fields: ["actionType", "intendedUse"] },
  { id: "target", label: "Target", fields: ["target"] },
  { id: "limits", label: "Hard limits", fields: ["maxAmount", "currency", "expiresAt"] },
  { id: "conditions", label: "Conditions", fields: ["conditions"] },
  { id: "sources", label: "Evidence sources", fields: ["sources"] },
  { id: "review", label: "Review", fields: [] },
  { id: "create", label: "Create", fields: [] },
] as const;

export function MandateWizard() {
  const now = useNow();
  const router = useRouter();
  const { client, config } = useMandateApp();
  const { address } = useConnection();
  const { send, records } = useTx();
  const [form, setForm] = useState<MandateForm>(() => blankForm(Math.floor(Date.now() / 1000)));
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState<Set<number>>(new Set());
  const [recordId, setRecordId] = useState<number | null>(null);

  const liveForm = useMemo(() => ({ ...form, now }), [form, now]);
  const errors = formErrors(liveForm);
  const errorsFor = (i: number) =>
    Object.fromEntries(
      Object.entries(errors).filter(([k]) => (STEPS[i].fields as readonly string[]).some((f) => k === f || k.startsWith(`${f}.`))),
    );
  const shown = touched.has(step) ? errorsFor(step) : {};
  const firstInvalid = STEPS.findIndex((s, i) => i < 6 && Object.keys(errorsFor(i)).length > 0);
  const record = records.find((r) => r.id === recordId);
  const busy = !!record && record.state.stage !== "FAILED" && record.state.stage !== "CONTRACT_STATE_UPDATED";

  const set = (patch: Partial<MandateForm>) => setForm((f) => ({ ...f, ...patch }));

  const next = () => {
    setTouched((t) => new Set(t).add(step));
    if (Object.keys(errorsFor(step)).length === 0) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const create = async () => {
    if (!address || firstInvalid >= 0) return;
    const terms = termsFromForm(liveForm);
    const known = (await reads.principalMandates(client, config, address, 0, 1).catch(() => ({ total: 0 }))).total;
    const call = createCall(liveForm.agent.trim(), terms);
    await send({
      title: `Create mandate: ${terms.target}`,
      effect: "The mandate is recorded on-chain as version 1.",
      ...call,
      reconciled: mandateCreated(client, config, address, known),
      onRecord: setRecordId,
      onReconciled: async () => {
        const page = await reads.principalMandates(client, config, address, 0, 1);
        const id = page.items[0]?.mandate_id;
        if (id) router.push(`/mandates/${id}`);
        return id ? `/mandates/${id}` : undefined;
      },
    });
  };

  const current = STEPS[step];
  const terms = termsFromForm(liveForm);

  return (
    <>
      <PageHeader eyebrow="New mandate" title="Grant a conditional mandate">
        Define exactly what one agent may do and the real-world conditions its authority depends on. You sign the creation
        with your wallet; you become the mandate&apos;s principal.
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <ol className="no-scrollbar flex gap-1 overflow-x-auto lg:grid lg:content-start lg:gap-1" aria-label="Steps">
          {STEPS.map((s, i) => {
            const on = i === step;
            const complete = i < step && Object.keys(errorsFor(i)).length === 0;
            return (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  aria-current={on ? "step" : undefined}
                  disabled={i > step && i > 0 && firstInvalid >= 0 && firstInvalid < i}
                  onClick={() => setStep(i)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm disabled:opacity-40 ${on ? "bg-surface text-text" : "text-dim hover:text-text"}`}
                >
                  <span className={`figure flex size-5 items-center justify-center rounded-full border text-[11px] ${complete ? "border-signal bg-signal text-ink" : on ? "border-signal text-signal" : "border-line"}`}>
                    {complete ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                  </span>
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>

        <section className="rounded-lg border border-line bg-well p-5 sm:p-6" aria-labelledby="step-title">
          <h2 id="step-title" className="mb-5 text-lg font-semibold">
            {step + 1}. {current.label}
          </h2>

          {current.id === "agent" ? <AgentFields form={form} set={set} errors={shown} /> : null}
          {current.id === "action" ? <ActionFields form={form} set={set} errors={shown} /> : null}
          {current.id === "target" ? <TargetFields form={form} set={set} errors={shown} /> : null}
          {current.id === "limits" ? <LimitFields form={form} set={set} errors={shown} /> : null}
          {current.id === "conditions" ? <ConditionFields form={form} set={set} errors={shown} /> : null}
          {current.id === "sources" ? <SourceFields form={form} set={set} errors={shown} /> : null}

          {current.id === "review" || current.id === "create" ? (
            <div className="grid gap-5">
              {firstInvalid >= 0 ? (
                <div role="alert" className="rounded-md border border-maybe/50 bg-maybe/10 px-4 py-3 text-sm">
                  <p className="font-medium text-maybe">This mandate is not ready yet.</p>
                  <p className="mt-1 text-dim">
                    {Object.values(errorsFor(firstInvalid))[0]}{" "}
                    <button type="button" className="text-signal underline-offset-2 hover:underline" onClick={() => { setTouched((t) => new Set(t).add(firstInvalid)); setStep(firstInvalid); }}>
                      Go to {STEPS[firstInvalid].label.toLowerCase()}
                    </button>
                  </p>
                </div>
              ) : null}
              <TermsSummary t={{ ...terms, agent: liveForm.agent }} principal={address} />
              {liveForm.agent && address && liveForm.agent.toLowerCase() === address.toLowerCase() ? (
                <p className="rounded-md border border-line bg-ink/40 px-4 py-3 text-sm text-dim">
                  You are naming your own wallet as the agent. The contract records that explicitly: you will both grant
                  and exercise this mandate.
                </p>
              ) : null}
            </div>
          ) : null}

          {current.id === "create" ? (
            <div className="mt-6 grid gap-3 border-t border-line pt-5">
              {!address ? <p className="text-sm text-maybe">Connect the principal&apos;s wallet to create this mandate.</p> : null}
              <p className="text-sm text-dim">
                Creating writes version 1 of these terms to the MANDATE Intelligent Contract. It checks every field again
                and refuses anything it cannot enforce.
              </p>
              <Button size="lg" className="w-fit" disabled={!address || firstInvalid >= 0 || busy} onClick={create}>
                {busy ? "Creating…" : "Create mandate"}
              </Button>
            </div>
          ) : null}

          <div className="mt-6 flex justify-between gap-3 border-t border-line pt-5">
            <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
              <ArrowLeft data-icon="inline-start" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next}>
                {STEPS[step + 1].label} <ArrowRight data-icon="inline-end" />
              </Button>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}

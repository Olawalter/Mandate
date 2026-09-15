"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useConnection } from "wagmi";

import { PreflightList } from "@/components/authorization/preflight-list";
import { TxLifecycle } from "@/components/authorization/tx-lifecycle";
import { DecisionBadge } from "@/components/decision/decision-badge";
import { inputClass, Field } from "@/components/mandate/terms-fields";
import { Button } from "@/components/ui/button";
import { findRequestByKey, newRequestKey, requestCall } from "@/lib/genlayer/mandate";
import { ACTION_LABEL, formatAmount, minorDigits, reasonText, toMinorUnits } from "@/lib/utils/present";
import { previewPreflight } from "@/lib/utils/validation";
import { useMandateApp } from "@/providers/app-providers";
import { useTx } from "@/providers/tx-provider";
import { ACTIONS, type AuthorizationRequest, type Mandate } from "@/types/mandate";

/**
 * The agent's request. Before signing, the deterministic checks the contract
 * will run are previewed from the mandate as stored on-chain; the contract
 * runs them again itself against the transaction time. A request that fails
 * them can still be sent — the contract records it as DENIED, which is the
 * honest outcome — but the panel says so first.
 */
export function RequestPanel({ mandate, now }: { mandate: Mandate; now: number }) {
  const { client, config } = useMandateApp();
  const { address } = useConnection();
  const { send, records } = useTx();
  const params = useSearchParams();
  const t = mandate.terms;
  const digits = minorDigits(t.currency);

  const [action, setAction] = useState<string>(params.get("action") ?? t.action_type);
  const [target, setTarget] = useState(params.get("target") ?? t.target);
  const [amountText, setAmountText] = useState(() => {
    const a = Number(params.get("amount"));
    return Number.isSafeInteger(a) && a > 0 ? (a / 10 ** digits).toFixed(digits) : "";
  });
  const [recordId, setRecordId] = useState<number | null>(null);
  const [decided, setDecided] = useState<AuthorizationRequest | null>(null);
  const record = records.find((r) => r.id === recordId);
  const busy = !!record && record.state.stage !== "FAILED" && record.state.stage !== "CONTRACT_STATE_UPDATED";

  const amount = toMinorUnits(amountText, t.currency);
  const checks = useMemo(
    () => previewPreflight(mandate, { signer: address, version: mandate.version, actionType: action, target, amount, currency: t.currency }, now),
    [mandate, address, action, target, amount, t.currency, now],
  );
  const isAgent = checks[0].passed;
  const allPass = checks.every((c) => c.passed);
  const amountMissing = amountText.trim() === "";

  const submit = async () => {
    if (!isAgent || amount === null) return;
    const key = newRequestKey();
    let requestId: string | null = null;
    setDecided(null);
    await send({
      title: `Request authorization: ${ACTION_LABEL[action] ?? action} ${formatAmount(amount, t.currency)}`,
      effect: "The contract recorded its decision for this request.",
      ...requestCall({ mandateId: mandate.mandate_id, version: mandate.version, actionType: action, target, amount, currency: t.currency, requestKey: key }),
      reconciled: async () => {
        const found = await findRequestByKey(client, config, mandate.mandate_id, key);
        if (found) {
          requestId = found.request_id;
          setDecided(found);
        }
        return !!found;
      },
      onRecord: setRecordId,
      onReconciled: () => (requestId ? `/decisions/${requestId}` : undefined),
    });
  };

  return (
    <section aria-labelledby="request-title" className="rounded-lg border border-line bg-well p-5">
      <h2 id="request-title" className="flex items-center gap-2 text-base font-semibold">
        <ShieldCheck className="size-4 text-signal" /> Request authorization
      </h2>
      <p className="mt-1 text-sm text-dim">
        Mandate #{mandate.mandate_id} · version {mandate.version}. Only the mandate&apos;s agent can send this.
      </p>

      <div className="mt-4 grid gap-4">
        <Field label="Action" htmlFor="req-action">
          <select id="req-action" className={inputClass} value={action} onChange={(e) => setAction(e.target.value)}>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL[a]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target" htmlFor="req-target">
          <input id="req-target" className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <Field label={`Amount (${t.currency})`} htmlFor="req-amount" error={amountText && amount === null ? "Enter a plain amount, like 4700 or 4700.00." : undefined}>
          <input id="req-amount" inputMode="decimal" className={`${inputClass} font-mono`} placeholder={(t.max_amount / 10 ** digits).toFixed(digits)} value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </Field>
      </div>

      <div className="mt-5 rounded-md border border-line bg-ink/40 p-4">
        <p className="eyebrow mb-3">Deterministic preflight</p>
        <PreflightList
          checks={checks.filter(
            (c) => !(amountMissing && c.check === "amount_within_limit") && !(!address && c.check === "agent_matches_mandate"),
          )}
        />
        <p className="mt-3 text-xs text-dim">
          {!address
            ? "Connect the agent's wallet to check that it is the agent this mandate names."
            : amountMissing
            ? "Enter the amount the agent wants to spend to check it against the mandate's limit."
            : allPass
            ? "GenLayer will evaluate the external conditions before producing the authorization decision."
            : isAgent
              ? "A hard limit fails. If you send this, the contract will record it as denied without reading any evidence."
              : "The connected wallet is not this mandate's agent, so the contract would refuse the request outright."}
        </p>
      </div>

      <Button className="mt-5 w-full" size="lg" disabled={!address || !isAgent || amount === null || busy} onClick={submit}>
        {busy ? "Waiting for GenLayer…" : "Request authorization"}
      </Button>
      {!address ? <p className="mt-2 text-xs text-dim">Connect the agent&apos;s wallet to request authorization.</p> : null}

      {record ? (
        <div className="mt-5 grid gap-3 border-t border-line pt-4">
          {decided ? (
            <div className="grid gap-2">
              <DecisionBadge decision={decided.decision} size="lg" />
              <p className="text-sm text-text">{reasonText(decided.reason_code)}</p>
            </div>
          ) : null}
          <TxLifecycle state={record.state} effect={record.effect} />
          {decided ? (
            <Link href={`/decisions/${decided.request_id}`} className="text-sm font-medium text-signal hover:text-signal-hover">
              Open the decision receipt #{decided.request_id}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

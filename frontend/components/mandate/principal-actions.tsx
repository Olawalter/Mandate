"use client";

import { Ban, PencilLine } from "lucide-react";
import { useMemo, useState } from "react";
import { useConnection } from "wagmi";

import { TxLifecycle } from "@/components/authorization/tx-lifecycle";
import { formFromMandate, termsFromForm } from "@/components/mandate/mandate-form-model";
import {
  ActionFields,
  AgentFields,
  ConditionFields,
  LimitFields,
  SourceFields,
  TargetFields,
} from "@/components/mandate/terms-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mandateRevoked, revokeCall, updateCall, versionReached } from "@/lib/genlayer/mandate";
import { formErrors, type MandateForm } from "@/lib/utils/validation";
import { useMandateApp } from "@/providers/app-providers";
import { useTx } from "@/providers/tx-provider";
import type { Mandate } from "@/types/mandate";

/**
 * Update and revoke, offered to the principal's wallet only. The contract
 * enforces the same rule; the interface hides nothing it would refuse — it
 * explains to anyone else why the actions are not theirs.
 */
export function PrincipalActions({ mandate, now }: { mandate: Mandate; now: number }) {
  const { client, config } = useMandateApp();
  const { address } = useConnection();
  const { send, records } = useTx();
  const [editing, setEditing] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [form, setForm] = useState<MandateForm>(() => formFromMandate(mandate, now));
  const [showErrors, setShowErrors] = useState(false);
  const [recordId, setRecordId] = useState<number | null>(null);
  const record = records.find((r) => r.id === recordId);
  const busy = !!record && record.state.stage !== "FAILED" && record.state.stage !== "CONTRACT_STATE_UPDATED";

  const isPrincipal = !!address && address.toLowerCase() === mandate.principal.toLowerCase();
  const revoked = mandate.status === "REVOKED";
  const live = useMemo(() => ({ ...form, now }), [form, now]);
  const errors = formErrors(live);
  const set = (patch: Partial<MandateForm>) => setForm((f) => ({ ...f, ...patch }));

  if (revoked) {
    return (
      <section className="rounded-lg border border-line bg-well p-5 text-sm text-dim">
        This mandate is revoked. Revocation is final: it cannot be updated, and every request is denied. Its versions and
        decisions stay on record.
      </section>
    );
  }

  const update = async () => {
    setShowErrors(true);
    if (Object.keys(errors).length) return;
    const next = mandate.version + 1;
    await send({
      title: `Update mandate #${mandate.mandate_id} to version ${next}`,
      effect: `Version ${next} is now current. Version ${mandate.version} and its decisions are unchanged.`,
      ...updateCall(mandate.mandate_id, mandate.version, termsFromForm(live)),
      reconciled: versionReached(client, config, mandate.mandate_id, next),
      onRecord: setRecordId,
    });
    setEditing(false);
  };

  const revoke = async () => {
    setConfirmRevoke(false);
    await send({
      title: `Revoke mandate #${mandate.mandate_id}`,
      effect: "The mandate is revoked. Every later request will be denied.",
      ...revokeCall(mandate.mandate_id),
      reconciled: mandateRevoked(client, config, mandate.mandate_id),
      onRecord: setRecordId,
    });
  };

  const shown = showErrors ? errors : {};

  return (
    <section aria-labelledby="principal-title" className="rounded-lg border border-line bg-well p-5">
      <h2 id="principal-title" className="text-base font-semibold">Principal controls</h2>
      {!isPrincipal ? (
        <p className="mt-1 text-sm text-dim">
          Only the principal who granted this mandate can update or revoke it. {address ? "The connected wallet is not that principal." : "Connect the principal's wallet to manage it."}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-dim">
            Updating creates version {mandate.version + 1} and starts it without any earlier authorization to compare
            against. Revoking is final.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => { setForm(formFromMandate(mandate, now)); setEditing((e) => !e); }}>
              <PencilLine data-icon="inline-start" /> {editing ? "Close editor" : "Update terms"}
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => setConfirmRevoke(true)}>
              <Ban data-icon="inline-start" /> Revoke mandate
            </Button>
          </div>
        </>
      )}

      {editing && isPrincipal ? (
        <div className="mt-5 grid gap-6 border-t border-line pt-5">
          <AgentFields form={form} set={set} errors={shown} lockedAgent />
          <ActionFields form={form} set={set} errors={shown} />
          <TargetFields form={form} set={set} errors={shown} />
          <LimitFields form={form} set={set} errors={shown} />
          <ConditionFields form={form} set={set} errors={shown} />
          <SourceFields form={form} set={set} errors={shown} />
          {showErrors && Object.keys(errors).length ? (
            <p role="alert" className="text-sm text-no">
              {Object.values(errors)[0]}
            </p>
          ) : null}
          <Button className="w-fit" disabled={busy} onClick={update}>
            Create version {mandate.version + 1}
          </Button>
        </div>
      ) : null}

      {record ? (
        <div className="mt-5 border-t border-line pt-4">
          <TxLifecycle state={record.state} effect={record.effect} />
        </div>
      ) : null}

      <Dialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <DialogContent className="rounded-lg border border-line bg-well sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke mandate #{mandate.mandate_id}?</DialogTitle>
            <DialogDescription className="text-dim">
              Revocation cannot be undone. The agent&apos;s every later request will be denied. Existing decisions stay on
              record.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmRevoke(false)}>
              Keep mandate
            </Button>
            <Button variant="destructive" onClick={revoke}>
              Revoke
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

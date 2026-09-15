"use client";

import { ExternalLink } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useContractActivity } from "@/hooks/use-activity";
import { PHASE_LABEL, type ChainTx } from "@/lib/genlayer/transactions";
import { ACTION_LABEL, shortAddress, shortHash } from "@/lib/utils/present";
import { useMandateApp } from "@/providers/app-providers";

const METHOD_LABEL: Record<string, string> = {
  create_mandate: "Create mandate",
  update_mandate: "Update mandate",
  revoke_mandate: "Revoke mandate",
  request_authorization: "Request authorization",
};

function describe(t: ChainTx): string {
  const a = t.args;
  switch (t.method) {
    case "create_mandate":
      return `${ACTION_LABEL[String(a[2])] ?? a[2]} ${a[3]}`;
    case "update_mandate":
      return `Mandate #${a[0]} from version ${a[1]}`;
    case "revoke_mandate":
      return `Mandate #${a[0]}`;
    case "request_authorization":
      return `Mandate #${a[0]} v${a[1]} · ${ACTION_LABEL[String(a[2])] ?? a[2]} ${a[3]}`;
    default:
      return "";
  }
}

function tone(t: ChainTx) {
  if (t.executionOk === false) return "text-no";
  if (t.phase === "finalized") return "text-yes";
  if (t.phase === "undetermined") return "text-no";
  if (t.phase === "accepted") return "text-text";
  return "text-maybe";
}

export function ActivityList({ filter, limit = 50 }: { filter?: string; limit?: number }) {
  const { config } = useMandateApp();
  const q = useContractActivity();
  if (q.isLoading) return <Skeleton className="h-24" />;
  const rows = (q.data ?? []).filter((t) => !filter || t.method === filter).slice(0, limit);
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-well text-xs text-dim">
          <tr>
            <th className="px-4 py-2.5 font-medium">Call</th>
            <th className="px-4 py-2.5 font-medium">Sender</th>
            <th className="px-4 py-2.5 font-medium">GenLayer status</th>
            <th className="px-4 py-2.5 font-medium">Transaction</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.hash} className="border-t border-line">
              <td className="px-4 py-2.5">
                <span className="font-medium">{METHOD_LABEL[t.method ?? ""] ?? t.method}</span>
                <span className="block text-xs text-dim">{describe(t)}</span>
              </td>
              <td className="px-4 py-2.5 font-mono text-xs">{shortAddress(t.from)}</td>
              <td className={`px-4 py-2.5 text-xs ${tone(t)}`}>
                {t.executionOk === false ? "Refused by the contract" : PHASE_LABEL[t.phase]}
              </td>
              <td className="px-4 py-2.5">
                <a href={`${config.explorer}/tx/${t.hash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs hover:text-signal">
                  {shortHash(t.hash)} <ExternalLink className="size-3" />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

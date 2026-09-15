import type { TxState } from "@/lib/genlayer/tx";

/**
 * The lifecycle a person sees, derived only from what GenLayer reported for
 * the transaction and what the contract's views show. It never claims to see
 * validator internals the client cannot read: "Consensus" means the
 * transaction is in GenLayer's commit/reveal phases, nothing more.
 *
 *   Wallet       the wallet signed and returned a hash
 *   Submitted    GenLayer's RPC knows the transaction
 *   Processing   a leader is executing it (PENDING / ACTIVATED / PROPOSING)
 *   Consensus    validators are committing and revealing votes
 *   Decision     ACCEPTED, and the contract's own state shows the result
 *   Finalized    GenLayer marked the transaction FINALIZED (appeal window closed)
 */

export const STEPS = ["wallet", "submitted", "processing", "consensus", "decision", "finalized"] as const;
export type Step = (typeof STEPS)[number];

export const STEP_LABEL: Record<Step, string> = {
  wallet: "Wallet signature",
  submitted: "Submitted",
  processing: "Processing",
  consensus: "Consensus",
  decision: "Decision",
  finalized: "Finalized",
};

export const STEP_HINT: Record<Step, string> = {
  wallet: "Confirm the transaction in your wallet.",
  submitted: "Waiting for GenLayer to register the transaction.",
  processing: "The leader is fetching evidence and executing the contract.",
  consensus: "Validators are independently re-evaluating and voting.",
  decision: "Reading the decision back from the contract.",
  finalized: "Accepted, still inside the appeal window. Not yet final.",
};

const RANK: Record<string, number> = {
  PENDING: 2,
  ACTIVATED: 2,
  PROPOSING: 2,
  COMMITTING: 3,
  REVEALING: 3,
  ACCEPTED: 4,
  APPEAL_REVEALING: 4,
  APPEAL_COMMITTING: 4,
  READY_TO_FINALIZE: 4,
  FINALIZED: 5,
};

export type StepState = "done" | "current" | "failed" | "todo";

export function lifecycle(state: TxState): Record<Step, StepState> {
  const out = Object.fromEntries(STEPS.map((s) => [s, "todo"])) as Record<Step, StepState>;
  let reached = -1;
  const order = ["READY", "AWAITING_WALLET", "USER_CONFIRMED", "SUBMITTED", "CONFIRMING", "CONFIRMED", "CONTRACT_STATE_UPDATED"];
  const stageRank = order.indexOf(state.reached);
  if (stageRank >= 2) reached = 0; // wallet
  if (stageRank >= 3) reached = 1; // submitted
  const statusRank = state.protocolStatus ? (RANK[state.protocolStatus] ?? -1) : -1;
  // a status is "passed" once the transaction moved beyond it
  if (statusRank >= 3) reached = Math.max(reached, 2);
  if (statusRank >= 4) reached = Math.max(reached, 3);
  if (stageRank >= 6) reached = Math.max(reached, 4);
  if (state.finality === "finalized" && stageRank >= 6) reached = 5;

  STEPS.forEach((s, i) => {
    if (i <= reached) out[s] = "done";
  });
  const next = STEPS[reached + 1];
  if (next) out[next] = state.stage === "FAILED" ? "failed" : state.stage === "READY" ? "todo" : "current";
  return out;
}

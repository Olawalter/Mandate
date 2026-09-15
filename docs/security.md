# Security

What MANDATE guarantees, how each guarantee is enforced and tested, and what it cannot promise.

## Access control

All permission checks are in the contract, against `gl.message.sender_address`. The frontend
mirrors them to explain, never to enforce.

| Action | Allowed signer | Otherwise |
|---|---|---|
| `create_mandate` | anyone; the signer is recorded as principal | — |
| `update_mandate` | the mandate's principal | `[EXPECTED] only the principal can update mandate N` |
| `revoke_mandate` | the mandate's principal | `[EXPECTED] only the principal can revoke mandate N` |
| `request_authorization` | the mandate's agent | `[EXPECTED] only the mandate's agent can request authorization` |
| every view | anyone | — |

No account is ever taken from calldata as proof of identity: the principal is the create signer,
the agent in every request record is the mandate's stored agent, and the request is refused unless
that agent signed it. The principal is not implicitly allowed to request; a principal who wants to
exercise their own mandate names their own address as agent, and the contract records exactly that.
There is no owner, admin or upgrade key.

## Mandate versioning

- Every update appends a new canonical terms record; earlier versions are never rewritten
  (`get_mandate_version(id, v)` returns them unchanged).
- `update_mandate` takes `expected_version`, so two concurrent updates cannot silently overwrite
  each other: the second is refused.
- A request names the version it was made under. A request naming anything but the current version
  is DENIED `VERSION_MISMATCH` and stays bound to the version it named, so a decision can never be
  read as applying to terms the agent did not see.
- Each version has its own baseline. A new version starts with none.
- The agent is fixed for a mandate's life; a different agent needs a new mandate.

## Replay and idempotency

`request_key` (1–64 of `A-Za-z0-9_-`) is unique per mandate. Reusing it is refused with the id of
the request that used it, whether that request was authorized or denied. A retried transaction
therefore cannot produce a second decision for the same intent. Keys are scoped to the mandate, so
different mandates can use the same key.

A successful authorization is not a reusable token: every request is assessed afresh against the
evidence read in that transaction.

## Evidence freshness

Evidence is fetched by every validator inside the request's own transaction. There is no cache and
no stored copy of any page, so evidence cannot be stale relative to the decision it supports. What a
snapshot records is the agreed finding per condition, the source it came from, a quote every
validator found in its own fetch, which sources were readable, and the transaction time
(`evaluated_at`).

## External source failure

A source that times out, returns a non-2xx status, an empty body or more than 1 MB is unreadable.
Consequences:

- no readable source → REASSESS_REQUIRED `EVIDENCE_UNAVAILABLE`, without a model call;
- some source unreadable and no violation found → REASSESS_REQUIRED `EVIDENCE_UNAVAILABLE`;
- a condition the readable evidence does not settle → REASSESS_REQUIRED `EVIDENCE_INCONCLUSIVE`.

AUTHORIZED requires every source read and every condition satisfied.

## LLM uncertainty

- The model returns findings only, in a fixed JSON shape. A non-object, a missing or duplicate
  condition, or a finding outside the enum is `[LLM_ERROR]`: the transaction reverts on that leader
  and validators disagree, so the round rotates; nothing is recorded.
- A claimed finding must be grounded: a quote of 12–200 characters that appears in the cited
  source as that node fetched it. Anything else is downgraded to UNVERIFIED in code, so a
  hallucinated or paraphrased justification cannot authorize.
- Prompt injection: pages are fenced, fence delimiters are stripped from page text and refused in
  principal-supplied text, and the prompt states that evidence cannot issue instructions. The
  injected-page test proves a page cannot close its fence.

## Validator disagreement

Validators compare every stored field exactly and check every stored quote against their own
fetch. A leader cannot:

- claim AUTHORIZED when the sources are down (validators read them as down);
- change a single finding, source, reason, readability entry or the material-change flag;
- store a quote that no validator can find in its own copy of the page;
- attach a quote to an UNVERIFIED row.

When validators cannot agree, the transaction does not reach ACCEPTED and records nothing. There
is no path from disagreement to AUTHORIZED.

## Fail-closed behaviour

| Situation | Result |
|---|---|
| hard limit fails | DENIED, no evidence read |
| evidence unreadable, ambiguous or ungrounded | REASSESS_REQUIRED |
| material change after authorization | REASSESS_REQUIRED |
| malformed model output | transaction reverts; no record |
| no consensus | transaction UNDETERMINED; no record |
| agreed result malformed | transaction reverts (`malformed assessment result`) |

## Transaction lifecycle and finality

A decision is readable once its transaction is ACCEPTED, and durable only once it is FINALIZED.
The frontend never presents a submitted transaction as a decision or an accepted one as final; the
receipt reads `LATEST_FINAL` state to show finality. A consumer acting on an authorization for
anything irreversible should require FINALIZED.

## Frontend trust assumptions

The frontend is untrusted by design:

- it stores nothing (no database, no backend, no localStorage state);
- every value on a mandate or receipt page is a contract field; the receipt's transaction hash is
  found from GenLayer's own transaction data by matching agent, contract, mandate and request key;
- before any write it checks the wallet's chain id and that the configured address exposes the
  MANDATE schema and identifies itself as MANDATE, and sends nothing otherwise;
- its preflight preview is advisory; the contract repeats every check at transaction time.

Why frontend state is never authoritative: anyone can run a modified copy of the interface. The
only thing a modified interface cannot change is what the contract records under consensus, so
every guarantee above is stated in terms of contract state.

## Wallet security

Writes are signed by the user's injected wallet (EIP-6963 discovery: MetaMask, Rabby, Trust
Wallet, others). The app passes the connected address and that wallet's provider to genlayer-js,
which asks the wallet to `eth_sendTransaction`; a test proves no signing or raw broadcast happens
in the app. No private key, seed phrase or API secret exists in the repository or the bundle.

## Limitations of external data

- MANDATE decides what the sources say, not whether they are true. The principal chooses them; a
  source controlled by an interested party can be edited to change a decision. Choose sources the
  agent and counterparty do not control. The demonstration policy page in `demo/` is controlled by
  this repository on purpose and says so on its face.
- Pages that render content with JavaScript may be unreadable to `web.get`.
- Validators run different models; a condition phrased ambiguously can split them, which produces
  no decision rather than a wrong one.
- Transaction time comes from GenLayer; expiry precision is that of the transaction's timestamp.

## Invariants and where they are tested

| # | Invariant | Direct test | Live test |
|---|---|---|---|
| 1 | Unauthorized address cannot update | `test_only_the_principal_can_update` | `test_only_the_principal_updates_and_revokes` |
| 2 | Unauthorized address cannot revoke | `test_only_the_principal_can_revoke` | same |
| 3 | Revoked mandate cannot authorize | `test_revoked_mandate_cannot_authorize` | `test_versioning_and_revocation` |
| 4 | Expired mandate cannot authorize | `test_request_at_and_after_expiry_is_denied` | — |
| 5 | Amount above limit cannot authorize | `test_hard_limit_failure_is_denied_without_evidence` | `test_hard_limits_deny_without_evidence` |
| 6 | Unsupported action cannot authorize | same | same |
| 7 | Wrong target cannot authorize | same | same |
| 8 | Nondeterministic code cannot mutate state | writes happen only after `_assess` returns; `test_malformed_model_output_reverts_and_records_nothing` | — |
| 9 | Leader output alone cannot authorize | `test_validator_refuses_a_leader_claiming_authorized` | — |
| 10 | Validators verify consensus-critical fields | `test_validator_compares_every_consensus_field`, `test_validator_refuses_a_leader_selected_replacement_quote` | — |
| 11 | External / LLM failure cannot authorize | `test_unreadable_sources_are_never_authorized`, `test_a_quote_not_on_the_page_cannot_authorize` | — |
| 12 | Every authorization references a version | `test_decisions_stay_bound_to_their_version` | `test_versioning_and_revocation` |
| 13 | Every semantic authorization references a snapshot | `test_all_conditions_satisfied_is_authorized_with_a_snapshot` | `test_real_evidence_decision_follows_reality` |
| 14 | Historical receipts keep their version | `test_decisions_stay_bound_to_their_version` | — |
| 15 | Material change forces REASSESS_REQUIRED | `test_policy_change_after_authorization_forces_reassessment` | `test_relevant_change_forces_reassessment` |
| — | Irrelevant change is not material | `test_irrelevant_page_change_is_not_a_material_change` | `test_irrelevant_change_is_not_material` |
| — | Replay refused | `test_request_key_cannot_be_replayed` | `test_replay_is_refused` |

### Mutation sweep

`python scripts/mutate.py` breaks one guard at a time in a scratch copy and requires the direct
suite to fail. **27/27 mutants killed**: every access check, every preflight check, quote
grounding and its minimum length, each decision rule, each fingerprint field, the validator's quote
check, the rule that unverified rows carry no quote, replay protection, baseline recording and
use, fence sanitising, and duplicate-URL refusal. One mutant is excluded as equivalent: removing the
post-consensus "AUTHORIZED only with every condition SATISFIED" guard, which `_derive` makes
unreachable; it stays as a boundary check.

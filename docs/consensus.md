# Consensus

How a MANDATE decision is reached, what validators agree on, and when it is durable.

## 1. The leader proposes

`request_authorization` runs the deterministic preflight first. Only if every hard limit holds does
the contract call `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` (`MandateContract._assess`).

`leader_fn`:

1. fetches every evidence source of the mandate version with `gl.nondet.web.get`; a non-2xx
   status, an empty body or a body over 1 MB makes that source unreadable;
2. extracts at most 6,000 characters of text per source (JSON compacted, HTML stripped of
   scripts, styles and tags) and removes `<<<`/`>>>` so a page cannot forge an evidence fence;
3. asks the model (`gl.nondet.exec_prompt`, JSON mode) for one finding per condition —
   `SATISFIED`, `VIOLATED` or `UNVERIFIED` — each with the source id and a verbatim quote;
4. passes the answer to `_derive`, pure code that returns the result.

The model is never told an earlier result, never asked for a decision, and has no field in which
to return one. It is given the terms, the condition requirements in the principal's words, and
the fenced evidence, with an explicit order of authority: page text can supply facts, never
instructions.

## 2. Validators evaluate independently

`validator_fn` never adopts the leader's reading. Each validator repeats steps 1–4 itself — its
own fetches, its own model call, its own derivation — and then:

- compares `_fingerprint(leader)` with `_fingerprint(mine)`: **every stored field must be equal**;
- checks `_quotes_hold(leader, my_evidence)`: every quote the leader would store must appear
  (case- and whitespace-insensitively) in the validator's own copy of the cited source, and an
  `UNVERIFIED` row must carry no quote at all.

A leader that returns an error is agreed with only if the validator hits the same deterministic
error (`[EXPECTED]`/`[EXTERNAL]`, same message) or both hit transient failures. Malformed model
output is `[LLM_ERROR]`: validators disagree and the round rotates to a new leader.

## 3. What is consensus-critical

Every field the contract stores from the round, and nothing else:

| Field | Compared how | Why it matters |
|---|---|---|
| `decision` | exact | the outcome |
| `reason_code` | exact | why, stored on the receipt |
| `material_change` | exact | distinguishes a changed reality from a never-authorized violation |
| `affected_conditions` | exact, ordered | named on the receipt as what changed |
| per condition `finding` | exact | `VIOLATED` vs `UNVERIFIED` changes DENIED vs REASSESS_REQUIRED |
| per condition `source` | exact | which page the finding rests on |
| `sources_readable` | exact | a missing source forbids AUTHORIZED |
| per condition `quote` | contained in the validator's own fetch | two honest fetches of a live page differ in bytes, so equality would split honest nodes; containment still stops a leader storing a passage no other node can find |

Reasoning prose is never stored and never compared.

This is a custom validator, not `prompt_comparative` or `prompt_non_comparative`: the decision
fields are structured and enumerable, so they are compared by code, exactly, instead of by a
second model's opinion of similarity. That is stricter, not weaker.

## 4. The decision is derived in code

`_derive(terms, raw_answer, my_evidence, baseline)`:

1. A `SATISFIED` or `VIOLATED` finding whose quote is shorter than 12 characters, cites a source
   this node could not read, or does not appear in that source, becomes `UNVERIFIED`.
2. `baseline` is the per-condition findings of this version's last AUTHORIZED snapshot, read from
   storage before the round — identical for every node.
3. Then, in order:

| Condition | Decision | Reason |
|---|---|---|
| a condition is `VIOLATED` and a baseline exists | `REASSESS_REQUIRED` | `MATERIAL_CHANGE` |
| a condition is `VIOLATED`, no baseline | `DENIED` | `CONDITION_VIOLATED` |
| no source readable | `REASSESS_REQUIRED` | `EVIDENCE_UNAVAILABLE` |
| a condition is `UNVERIFIED` | `REASSESS_REQUIRED` | `EVIDENCE_INCONCLUSIVE` |
| a source unreadable | `REASSESS_REQUIRED` | `EVIDENCE_UNAVAILABLE` |
| otherwise (all `SATISFIED`, all sources read) | `AUTHORIZED` | `CONDITIONS_SATISFIED` |

After consensus, `request_authorization` validates the agreed result's shape again (decision in
the enum, one finding per condition in order, AUTHORIZED only with every finding SATISFIED) before
anything is written. Nondeterministic code never touches storage.

### Material change is semantic

Nothing compares page hashes. A change counts only when it flips a condition the principal made
authority depend on: a baseline `SATISFIED` becoming `VIOLATED` now. Billing wording changing on
the same page leaves `intended_use_permitted` `SATISFIED`, so the decision stays AUTHORIZED with
`material_change = false`. Both cases are tested directly and were proven live on StudioNet
([`e2e-verification.md`](e2e-verification.md)).

## 5. Accepted is not final

GenLayer's Optimistic Democracy lifecycle for the transaction:

```text
PENDING → PROPOSING → COMMITTING → REVEALING → ACCEPTED ──(appeal window)──▶ FINALIZED
                                                  │
                                                  └─ an appeal re-runs the round with more validators
```

- When the transaction is **ACCEPTED**, the decision is readable (`LATEST_NONFINAL`) and the app
  shows it — labelled "Accepted, not yet final".
- It is **durable** only when GenLayer marks the transaction **FINALIZED** after the appeal window.
  The receipt page re-reads the same receipt from `LATEST_FINAL` state and says "Finalized" only
  when that read returns the same decision.
- MANDATE adds no appeal mechanism of its own; appeals are the protocol's. On StudioNet an appeal
  of an accepted transaction has been observed to erase the appealed contract (documented in the
  STATELOCK build), so the live suite does not appeal the deployment of record.
- A request whose round cannot reach agreement ends `UNDETERMINED` and changes nothing: no record,
  no snapshot, no authorization.

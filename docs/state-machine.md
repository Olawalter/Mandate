# State machines

Three things have state, and they are kept apart: the **mandate**, the **authorization request**
(its semantic decision), and the **GenLayer transaction** that carries the request.

## Mandate

```text
            create_mandate (signer = principal)
                     │
                     ▼
               ┌──────────┐  update_mandate (principal, expected_version = N)
               │  ACTIVE  │─────────────────────────────▶ ACTIVE, version N+1
               │ version N│◀─────────────────────────────  (N kept unchanged; no baseline)
               └──────────┘
                │        │
  revoke_mandate│        │ transaction time ≥ expires_at
   (principal)  ▼        ▼
          ┌─────────┐  ┌─────────┐  update_mandate with a new expiry
          │ REVOKED │  │ EXPIRED │─────────────────────────────▶ ACTIVE, version N+1
          │ terminal│  └─────────┘
          └─────────┘
```

| Stored | Derived |
|---|---|
| `status` ∈ {ACTIVE, REVOKED} | EXPIRED = ACTIVE and `now ≥ terms.expires_at` |

Expiry is not stored because no transaction happens at the moment a mandate expires. Every request
checks it against the transaction time; every reader derives it from the stored expiry.

| Transition | Who | Refused when |
|---|---|---|
| create | anyone (becomes principal) | invalid terms, expiry not in (now, now + 366 days] |
| update | principal | not principal, revoked, `expected_version` ≠ current, invalid terms |
| revoke | principal | not principal, already revoked |

## Authorization request

```text
           request_authorization (signer = mandate's agent)
                         │
   refused outright ◀────┤ unknown mandate · signer ≠ agent · malformed key · key reused
   (no record)           │
                         ▼
               deterministic preflight ── fails ──▶ DENIED (assessed = false, no snapshot)
                         │ passes
                         ▼
                  GenLayer assessment
                  (leader + validators)
                         │
     no agreement ◀──────┤
     (tx UNDETERMINED,   │ agreed
      no record)         ▼
          ┌──────────────┼────────────────────┐
          ▼              ▼                    ▼
     AUTHORIZED        DENIED         REASSESS_REQUIRED
     snapshot,         snapshot       snapshot
     sets baseline
```

A request record is immutable once written. There is no "pending" record: a request exists on-chain
only with its decision. The earlier stages a person sees — submitted, processing, consensus — are
the transaction's, read from GenLayer.

### Recovering from REASSESS_REQUIRED

REASSESS_REQUIRED is not a dead end, and no one needs to act for the agent to try again:

- **Fresh assessment** — the agent requests again (a new request key). The evidence is read again.
  If the condition holds again, the decision is AUTHORIZED and the baseline moves forward.
- **New version** — the principal reviews the changed reality and issues version N+1. It starts
  with no baseline, so the new terms are judged on their own: a violation is DENIED, satisfied
  conditions are AUTHORIZED.
- **Revoke** — the principal ends the mandate.

## Transaction (GenLayer's, shown by the app)

| App step | GenLayer status | Meaning |
|---|---|---|
| Wallet signature | — | the wallet returned a hash |
| Submitted | known to the RPC | GenLayer can read the transaction |
| Processing | PENDING, ACTIVATED, PROPOSING | the leader is executing |
| Consensus | COMMITTING, REVEALING | validators vote |
| Decision | ACCEPTED, and the contract's view shows the record | the decision is readable, still appealable |
| Finalized | FINALIZED | the appeal window closed; durable |
| Failed | UNDETERMINED, timeouts, or leader execution ERROR | nothing changed; the contract's refusal sentence is shown |

A submitted transaction is never shown as an authorization, and an accepted one is never shown
as final.

# Architecture

MANDATE answers one question for an autonomous agent:

> Is this particular agent still authorized to perform this particular action under the
> conditions defined by the principal?

The answer is produced and stored by a GenLayer Intelligent Contract,
[`contracts/mandate.py`](../contracts/mandate.py). The frontend reads it and helps people send
wallet-signed transactions. It holds no state and decides nothing.

## The decision, end to end

```text
PRINCIPAL ──create_mandate──────────────▶ MANDATE INTELLIGENT CONTRACT
                                          ├── agent (fixed for the mandate's life)
                                          ├── action · target · max amount · currency
                                          ├── expiry (UTC seconds)
                                          ├── conditions (named slots, principal's words)
                                          ├── evidence sources (https URL + purpose)
                                          └── version N (every change = N+1)

AGENT ──request_authorization(id, version, action, target, amount, currency, key)
          │
          ▼
   access control ─── signer ≠ agent, unknown mandate, reused key ──▶ transaction refused
          │
          ▼
   DETERMINISTIC PREFLIGHT (contract code, transaction time)
   active · not expired · version current · action · target · currency · amount ≤ max
          │ any fails ──────────────────────────────▶ DENIED  (no evidence read)
          ▼
   gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │ leader and every validator, independently:                                   │
   │   gl.nondet.web.get(each source) → bounded, sanitised text                   │
   │   gl.nondet.exec_prompt → per condition SATISFIED | VIOLATED | UNVERIFIED     │
   │                           + source id + verbatim quote                       │
   │   _derive (pure code): quote must be in THIS node's copy of the source,      │
   │                        compare with the version's baseline, pick decision    │
   │ validator: fingerprint(leader) == fingerprint(mine)                          │
   │            AND every leader quote is in the validator's own fetch            │
   └──────────────────────────────────────────────────────────────────────────────┘
          │ agreed result (nondeterministic code wrote nothing)
          ▼
   deterministic code validates the result's shape, then writes:
   evidence snapshot · request record (receipt) · baseline (if AUTHORIZED) · counters
          ▼
   AUTHORIZED | DENIED | REASSESS_REQUIRED   → accepted → finalized by GenLayer
```

## Why GenLayer, and why not an ordinary smart contract

Every hard limit above — agent, status, version, action, target, currency, amount, expiry — is
ordinary deterministic logic, and MANDATE keeps it deterministic. What an EVM contract cannot do
is the part the product exists for: **deterministic authorization rules alone cannot adjudicate
whether changing external real-world conditions still satisfy the mandate.** "Does the provider's
current acceptable use policy still permit AI inference?" has no on-chain answer and no stable
API; it is a judgment over a live web page.

An oracle could carry that judgment in, but then one party decides and everyone else trusts it.
In MANDATE the judgment is made under consensus: several validators fetch the same page, read it
independently, and the decision is recorded only when they agree on every field it depends on.
A centralized authorization service would be the thing the agent's principal has to trust; here
the trusted component is the protocol.

## The boundary

| Owned by | What |
|---|---|
| Contract, deterministic | identity and access control, versions, hard limits, replay protection, the baseline, the decision derivation, every storage write, all views |
| Contract, nondeterministic | fetching the evidence sources, reading them into per-condition findings with quotes |
| Model | nothing but findings; it never sees an earlier result and never names a decision |
| External sources | raw facts, fetched fresh by every validator on every request |
| Frontend | forms, previews, wallet signing, lifecycle display, reading contract state |

## Contract layout

`contracts/mandate.py` is one file:

- **Pure helpers** (no storage access): `_parse_terms`, `_preflight`, `_extract_text`,
  `_build_prompt`, `_derive`, `_fingerprint`, `_quotes_hold`. Leader and validators call the same
  functions, which is what makes independent evaluation comparable.
- **Storage**: `TreeMap`/`DynArray` of strings and one `@allow_storage` dataclass (`Mandate`).
  Versions, requests and snapshots are canonical JSON strings — compact, append-only, never
  mutated. Per-agent, per-principal and per-mandate indexes keep every view a bounded page
  (at most 50 items); no view scans all state.
- **Writes**: `create_mandate`, `update_mandate`, `revoke_mandate`, `request_authorization`.
- **Views**: `get_protocol_info`, `get_mandate`, `get_mandate_version`, `get_authorization`,
  `get_evidence_snapshot`, `get_decision_receipt`, `get_agent_mandates`,
  `get_principal_mandates`, `list_mandates`, `list_requests`, `list_mandate_requests`.

Exact signatures are those GenLayer derived from the deployment, recorded in
[`deployment.json`](deployment.json) and checked by the frontend at startup.

## Frontend layout

`frontend/` is a Next.js 16 App Router application (React 19, TypeScript strict, Tailwind 4,
Turbopack, pnpm). Pages are server components that render client components only where a wallet,
live reads or a form is needed.

| Route | What it shows |
|---|---|
| `/` | totals from `get_protocol_info`, recent decisions, mandate activity, requests on chain |
| `/mandates` | all mandates, or those granted by / to the connected wallet |
| `/mandates/new` | eight-step wizard: agent, action, target, hard limits, conditions, sources, review, create |
| `/mandates/[id]` | terms by version, decision history, the agent's request panel, principal controls |
| `/requests` | pending assessments (in consensus) and decided requests by outcome |
| `/decisions/[id]` | the decision receipt, reconstructed from `get_decision_receipt` |
| `/activity` | recent transactions to the contract, decoded from their calldata |

Reads use genlayer-js `readContract` (LATEST_NONFINAL, and LATEST_FINAL on the receipt to show
finality). Writes use `writeContract` on a client created with the connected wallet's address and
EIP-1193 provider, so the wallet signs `eth_sendTransaction`; no key exists in the app.

## Toolchain versions verified for this build

| Tool | Version |
|---|---|
| Python | 3.12 |
| GenVM runner (contract `Depends`) | `py-genlayer:1jb45aa8…` (GenVM v0.3.0-rc7 bundle) |
| genvm-linter | 0.11.0 |
| genlayer-test (gltest, direct mode) | 0.29.2 |
| genlayer-py (live harness) | 0.16.3 |
| GenLayer CLI | 0.39.2 |
| genlayer-js | 1.1.8 (latest) |
| Node.js | 22.11 (≥ 20.9 required) |
| pnpm | 10.33 |
| Next.js / React / TypeScript | 16.3.5 / 19.2.8 / 5.9.3 |

### API names that differ from the specification

The specification anticipated some GenLayerJS names. genlayer-js 1.1.8, inspected directly, exposes
these instead, and MANDATE uses them:

| Specification | genlayer-js 1.1.8 |
|---|---|
| `waitForDecision()` | `waitForTransactionReceipt({ hash, status: ACCEPTED })` plus `isDecidedState` |
| `waitForFinalization()` | `waitForTransactionReceipt({ hash, status: FINALIZED })` |
| `advanced.getTransactionLifecycle()` | `getTransaction({ hash })` polled; status names from the receipt |
| `estimateTransactionFeesForWrite` | not present in 1.1.8; only `estimateTransactionGas` exists, and genlayer-js calls it itself while sending. The app does not show a fee estimate |
| `LATEST_FINAL` / `LATEST_NONFINAL` | `TransactionHashVariant.LATEST_FINAL` / `LATEST_NONFINAL` on `readContract` |

TypeScript 7.0 is the newest release on npm. This build was verified with 5.9.3, the newest 5.x;
moving to 7 was not attempted.

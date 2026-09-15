# MANDATE

> Conditional authorization for autonomous agents. A principal grants an agent one action, one
> target, a hard limit, an expiry, and the real-world conditions that authority depends on. Every
> time the agent asks to act, GenLayer validators read the evidence again and the Intelligent
> Contract decides: **authorized**, **denied**, or **reassess required**.

**Authorization that expires when reality changes.** One Intelligent Contract and a static web
app. No backend, no database, no admin, no server-side key.

| | |
|---|---|
| Contract | [`0x5344bEae1A09c674831B174eD6BD077a5d7e58ba`](https://explorer-studio.genlayer.com/address/0x5344bEae1A09c674831B174eD6BD077a5d7e58ba) on GenLayer StudioNet (chain 61999), byte-identical to [`contracts/mandate.py`](contracts/mandate.py) ([`docs/deployment.json`](docs/deployment.json)) |
| Live suite | 11/11 on StudioNet — [`docs/live-e2e.json`](docs/live-e2e.json) |
| In-app E2E | AUTHORIZED → policy change → REASSESS_REQUIRED → fresh assessment, through the app — [`docs/e2e-verification.md`](docs/e2e-verification.md) |
| Frontend deployment | not deployed yet (see [Frontend setup](#frontend-setup)) |

---

## What MANDATE is

An agent buying cloud compute on someone's behalf needs more than a spending limit. Its principal
approved the purchase *because* the provider was in good standing, the service was up, the terms
allowed it, and the provider permitted the use the agent has in mind. Those are facts about the
world, and they change after the approval is given:

```text
Permission granted yesterday  ≠  permission automatically valid today
```

MANDATE records the approval together with the conditions it rests on and re-checks those
conditions every time the agent asks. The question it answers is exact:

> Is this particular agent still authorized to perform this particular action under the conditions
> defined by the principal?

## Why GenLayer is required

Everything MANDATE can decide with fixed rules — who the agent is, whether the mandate is active,
unexpired and current, whether the action, target, currency and amount fit — it decides with fixed
rules, in contract code. A normal EVM smart contract could do all of that.

What it cannot do is the part the product exists for: **deterministic authorization rules alone
cannot adjudicate whether changing external real-world conditions still satisfy the mandate.**
"Does the provider's acceptable use policy still permit AI inference?" is a judgment over a live
web page. On an EVM chain someone off-chain makes that judgment and everyone trusts them. On
GenLayer the leader and every validator fetch the page and read it independently, the decision is
stored only if they agree on every field it depends on, and GenLayer's appeal and finality rules
apply to it.

## Architecture

```text
 PRINCIPAL ─ create / update / revoke ─▶ ┌───────────────────────────────────────────────┐
                                         │  MANDATE INTELLIGENT CONTRACT (GenVM, Python)  │
                                         │                                                │
 AGENT ─ request_authorization ─────────▶│ 1 access control   signer = agent, key unused  │
   (mandate, version, action,            │ 2 preflight        active · expiry · version · │
    target, amount, currency, key)       │                    action · target · amount    │
                                         │        │ fail ──────────────────▶ DENIED       │
                                         │        ▼                                       │
                                         │ 3 gl.vm.run_nondet_unsafe                      │
 EVIDENCE SOURCES ◀── gl.nondet.web.get ─│   leader + each validator, independently:      │
 (status pages, terms, policies)         │   fetch → exec_prompt → findings + quotes      │
                                         │   → _derive (code) → decision                  │
                                         │   validators: every field equal, every quote   │
                                         │   in their own fetch                           │
                                         │        ▼ agreed                                │
                                         │ 4 snapshot · receipt · baseline (storage)      │
                                         └────────────────────────┬──────────────────────┘
                                                                  │ AUTHORIZED / DENIED /
                                                                  │ REASSESS_REQUIRED
 FRONTEND (Next.js, wallet-signed writes, reads only) ◀───────────┘ accepted → finalized
```

Details: [`docs/architecture.md`](docs/architecture.md).

## How conditional authorization works

1. **The principal creates a mandate** — agent address, action (`PURCHASE`, `SUBSCRIBE`, `RENEW`,
   `PAY`), target, maximum amount in minor units, currency, expiry, intended use, conditions and
   evidence sources. It is stored as version 1.
2. **The agent requests authorization** with the mandate id, the version it is acting under, the
   action, target, amount, currency and a unique request key.
3. **The contract runs the deterministic preflight.** Any failure is DENIED, recorded without
   reading any evidence.
4. **GenLayer assesses the conditions.** Each node fetches the sources, reads each condition as
   SATISFIED, VIOLATED or UNVERIFIED with a verbatim quote, and code derives the decision.
5. **The decision is stored** with an evidence snapshot and becomes the receipt. An AUTHORIZED
   decision becomes the version's *baseline*.
6. **Next time, reality is read again.** If a condition that held at the baseline no longer holds,
   the answer is REASSESS_REQUIRED.

## Decision states

| Decision | When | What happens next |
|---|---|---|
| **AUTHORIZED** | every hard limit holds; every source was read; every condition is satisfied by a quote found on its page | the snapshot becomes this version's baseline |
| **DENIED** | a hard limit fails (revoked, expired, stale version, wrong action / target / currency, amount over the limit), or a condition is violated on a version never authorized | the agent cannot act; the principal can issue a new version |
| **REASSESS_REQUIRED** | a condition that justified an earlier authorization no longer holds (**material change**), or evidence is unavailable, ambiguous or could not be grounded | the agent can request a fresh assessment; the principal can issue a new version or revoke |

Uncertainty never becomes AUTHORIZED.

## Evidence model

- A mandate names up to four `https` sources, each with a declared purpose (`PROVIDER_STATUS`,
  `TERMS_COMPATIBILITY`, `ELIGIBILITY`, `POLICY`). Duplicate URLs are refused after normalisation.
- Conditions are four named slots — `provider_eligible`, `service_available`, `terms_compatible`,
  `intended_use_permitted` — each described in the principal's own words, so every snapshot has
  the same comparable shape.
- Pages are fetched fresh in the request's transaction by every node. No page is ever stored.
- The snapshot stores, per condition, the agreed finding, the source id and a quote of 12–200
  characters; plus which sources were readable, the four condition flags, `material_change`,
  `affected_conditions`, the baseline snapshot id and the evaluation time.

## Consensus model

`request_authorization` uses `gl.vm.run_nondet_unsafe` with a custom validator. The validator does
the whole task again — its own fetches, its own model call, its own derivation — and agrees only if

- every stored field is exactly equal: decision, reason, material change, affected conditions,
  each condition's finding and source, and which sources were readable; and
- every quote the leader would store appears in the validator's own copy of the cited page.

Prose is never compared. Malformed model output rotates the leader; disagreement records nothing.
A decision is readable when the transaction is ACCEPTED and durable when it is FINALIZED.
Details: [`docs/consensus.md`](docs/consensus.md), [`docs/state-machine.md`](docs/state-machine.md).

## Material change detection

Material change is **semantic**, not a page hash. It is true only when a condition the principal
made authority depend on was SATISFIED in this version's last AUTHORIZED snapshot and is VIOLATED
now. Proven live on StudioNet with a demonstration policy page edited by real git commits:

| Page change | Decision | Material change |
|---|---|---|
| inference permitted (baseline) | AUTHORIZED | no |
| only the billing sentence changed | AUTHORIZED | **no** |
| inference prohibited | **REASSESS_REQUIRED** | **yes** — `intended_use_permitted` |
| inference permitted again | AUTHORIZED | no |

The demonstration page, [`demo/northwind-compute/acceptable-use.md`](demo/northwind-compute/acceptable-use.md),
is a controlled fixture and says so on its face; Northwind Compute is not a real provider. The live
suite also authorizes against a real source, GitHub's public status API.

## Contract deployment

```bash
python -m pip install -r requirements.txt
python scripts/deploy.py                       # throwaway faucet-funded deployer; waits for FINALIZED; verifies bytes
python scripts/inspect.py <address> --write-deployment
```

Both deploy paths were run for this build, each producing a check deployment verified
byte-identical to `contracts/mandate.py`:

| Path | Deployment |
|---|---|
| `python scripts/deploy.py` (ephemeral faucet-funded key, waits for FINALIZED) | `0xDF9B067F016dD48Fc1497f0732f7F3819F028AAe` |
| `genlayer network studionet && genlayer deploy` — GenLayer CLI 0.39.2 runs [`deploy/deployScript.ts`](deploy/deployScript.ts) with the CLI's active account | `0xB79e044f7008a48c6DcC5c608eb46D2030B35CD6` |

Running the CLI path found two things the script now handles: the CLI's bundled genlayer-js
reports a numeric `status` without `statusName`, and `getContractCode` already returns decoded text.

**Runner pin.** `genvm-lint` suggests a newer runner (`py-genlayer:1zr6nqk5…`). It was tried on a
disposable deployment: StudioNet rejected it (`invalid_contract`, transaction
`0x3913f7dc6e1f0f9cda104142698ac770815e5182f9ddf20481cad88f646e31f1`), and the linter's cached GenVM
v0.3.0-rc7 bundle cannot load it either. MANDATE therefore stays on `py-genlayer:1jb45aa8…`, the
runner StudioNet executes.

`inspect.py` compares `gen_getContractCode` with the file at a git revision byte for byte and
records the schema the frontend is checked against.

Contract methods — writes: `create_mandate`, `update_mandate`, `revoke_mandate`,
`request_authorization`; views: `get_protocol_info`, `get_mandate`, `get_mandate_version`,
`get_authorization`, `get_evidence_snapshot`, `get_decision_receipt`, `get_agent_mandates`,
`get_principal_mandates`, `list_mandates`, `list_requests`, `list_mandate_requests`.

## Frontend setup

Requires Node.js ≥ 20.9 and pnpm.

```bash
cd frontend
pnpm install
cp .env.example .env.local
pnpm dev
```

Deploying: create a Vercel (or any Next.js host) project with root directory `frontend` and the
environment variables below. No other service is needed.

Pages: overview, mandates, the eight-step mandate wizard, mandate detail (terms by version, request
panel with the deterministic preflight, principal update and revoke), requests, decision receipts,
and contract activity. Wallets: any injected EIP-1193 wallet discovered through EIP-6963 —
MetaMask, Rabby, Trust Wallet and others — with network detection and a switch prompt.

## Environment variables

| Variable | Where | Value |
|---|---|---|
| `NEXT_PUBLIC_GENLAYER_NETWORK` | frontend | `studionet` |
| `NEXT_PUBLIC_GENLAYER_CHAIN` | frontend | `61999` |
| `NEXT_PUBLIC_MANDATE_CONTRACT` | frontend | `0x5344bEae1A09c674831B174eD6BD077a5d7e58ba` |
| `NEXT_PUBLIC_GENLAYER_RPC_URL` | frontend, optional | defaults to `https://studio.genlayer.com/api` |
| `NEXT_PUBLIC_APP_ENV` | frontend, optional | `development` · `test` · `staging` · `production` |
| `SKIP_INTEGRATION` | tests | `0` runs the live suite |
| `MANDATE_CONTRACT` | tests | reuse a deployment in the live suite |
| `MANDATE_DEMO_PUSH` | tests | `0` skips the arc that edits the demo page with git |

Nothing secret is configured anywhere.

## Testing

```bash
genvm-lint check contracts/mandate.py --json          # PYTHONUTF8=1 on Windows
python -m pytest tests/direct -v                       # 85 direct-mode tests (gltest runner)
python scripts/mutate.py                               # 27/27 mutants killed
SKIP_INTEGRATION=0 python -m pytest tests/integration -v -s   # live StudioNet, ~25 min
pnpm --dir frontend lint
pnpm --dir frontend typecheck
pnpm --dir frontend test                               # 42 tests
pnpm --dir frontend build
```

`gltest tests/integration -v -s` collects the same live tests; the suite was run with
`python -m pytest`. Direct tests mock the web and the model as test fixtures only, to prove what
the contract decides from a given reading; the live suite uses real validators, real pages and
real models. CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint + direct tests and
the frontend's typecheck, lint, tests and build on every push; the live suite runs on demand.

## Live E2E verification

See [`docs/e2e-verification.md`](docs/e2e-verification.md) for both scenarios step by step, every
transaction hash, and how a reviewer can reconstruct each decision from contract state alone.

## Security assumptions

Summarised from [`docs/security.md`](docs/security.md):

- every permission check is in the contract against the transaction signer;
- a request key is single-use per mandate; every request is assessed afresh;
- nondeterministic code writes nothing; storage changes only after the agreed result is validated;
- failure, ambiguity and disagreement end as REASSESS_REQUIRED or no record — never AUTHORIZED;
- the frontend is untrusted and stores nothing; receipts are rebuilt from contract state;
- the wallet signs; the app holds no key.

## Known limitations

- **Sources decide what is true.** MANDATE rules on what the chosen pages say. A principal who picks
  a page an interested party can edit hands that party the decision. The demo page is controlled
  on purpose and labelled.
- **StudioNet only.** The deployment is on GenLayer StudioNet, a development network.
- **JavaScript-rendered pages** may be unreadable to `web.get`; such a source yields
  REASSESS_REQUIRED rather than a decision.
- **Model variance.** Validators run different models. An ambiguously phrased condition can prevent
  agreement, which records nothing — safe, but no answer.
- **Four condition slots.** Conditions are fixed named slots with free-text requirements so
  snapshots stay comparable across versions; arbitrary condition names are not supported.
- **Recent transactions only.** The receipt finds its transaction through
  `sim_getTransactionsForAddress`, which returns recent transactions; for an old decision the hash
  may not be found, while the decision itself remains in contract state.
- **No fee estimate.** genlayer-js 1.1.8 has no `estimateTransactionFeesForWrite`; the app does
  not display fees.
- **Real-wallet run.** The in-app E2E used an injected EIP-6963 test wallet in a browser without
  extensions (documented as a harness); a run with MetaMask or Rabby by a person is still to do.

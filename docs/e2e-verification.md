# End-to-end verification

Two independent end-to-end runs against the deployment of record, plus the manual procedure for a
person with their own wallet, and how a reviewer can check every claim without trusting this
repository or its interface.

| | |
|---|---|
| Network | GenLayer StudioNet, chain 61999, RPC `https://studio.genlayer.com/api` |
| Contract | [`0x5344bEae1A09c674831B174eD6BD077a5d7e58ba`](https://explorer-studio.genlayer.com/address/0x5344bEae1A09c674831B174eD6BD077a5d7e58ba) |
| Code | 49,698 bytes, sha256 `9a6db572f57c51e28e67f82e483f33a63a99ee163add4401288e49e585a2f315`, byte-identical to `contracts/mandate.py` ([`deployment.json`](deployment.json)) |
| Deploy transaction | `0x41ea41ff7167337b7bd951bae3450e32ebf2abc240528fe5b178d331280df691` |

## Run 1 — live integration suite (script)

```bash
SKIP_INTEGRATION=0 python -m pytest tests/integration -v -s
```

**11 passed in 25 min 38 s** (15 Sep 2026, 11:27–11:52 UTC). Record: [`live-e2e.json`](live-e2e.json).
Throwaway accounts: principal `0x2E51c205910f1d319A32249b65cA6F4b0345821d`, agent
`0x0b5358932B722a42de71F5DdDFA4b354287d03c6`, stranger `0x48397DC0C62d5DcC781f8C01391C5a76d5136aDD`.
Every transaction below was ACCEPTED with `MAJORITY_AGREE`.

### Real evidence — mandate #1, "GitHub Codespaces compute"

The single condition, `service_available`, was read from GitHub's public status API
(`components.json` and `status.json`). The harness read the same API itself before and after the
request; Codespaces was operational both times, so the test asserted AUTHORIZED.

| Step | Transaction | Result |
|---|---|---|
| create mandate | `0x0a531529e1b0e1abc802bcdec6e430d3305b8be080f08010c7831ba16929cd15` | mandate #1 v1 |
| request $4,700 | `0xc618a68a1c9fe1831b6b18132acb40604c3c20a817f1b9f5fa36a4f8a1c9f14c` | **AUTHORIZED**, snapshot #1, quote `"Codespaces","status":"operational"` from S1; transaction later **FINALIZED** (votes agree ×3) and the receipt read from `LATEST_FINAL` state matched |
| request by a stranger | `0x5d550ee00f85e21927f149825e0aa96d1b3fd5651544ae80510032062ebb859d` | refused: `only the mandate's agent can request authorization` |
| request by the principal | `0x884a8072a53b9250445a85908d61a3c9ea2c33d4bf6e0af4838daf2f9ac09775` | refused: same |
| request $5,000.01 | `0xf11cc0d1fc479bbe71eeec4222a6bc056f0997866fd1b7cde53074070a8ecbb8` | DENIED `AMOUNT_EXCEEDS_LIMIT`, no snapshot |
| request another target | `0xe6f76d87f0b40289b36ae9f32fa24347ab6df6152a562f7caa12d539fcd395bd` | DENIED `TARGET_NOT_PERMITTED` |
| request another action | `0x57c1452ffbac4b1e4bc993fe1c0780f7d8c6732c723a42bb487e0b4d415104a1` | DENIED `ACTION_NOT_PERMITTED` |
| replay the first request key | `0xaf4dc546e172638e3241fdf2b5a54c8f018967dcf94cafbfd2e601b342e90b92` | refused: `request_key live-real_evidence-1 was already used by request 1` |
| update by a stranger | `0x16328bceda7cec4ba215dfe280f75379707957637609c81eccc96e78fb4e211b` | refused: `only the principal can update mandate 1` |
| revoke by a stranger | `0xeb8f11f7285a32eda6f15839b85059dc7b5c05b1a1e262cf2298753c34ad8fd9` | refused: `only the principal can revoke mandate 1` |
| update to version 2 (limit $4,000) | `0x55a5f837938c44a0f73050de0ee26d248456bec3be8ba8b8aaa0aa024e820fba` | version 2; version 1 unchanged |
| request naming version 1 | `0xd5af093b02021820e11931442e16ecc7818555530fcce53f2f8ed9451329f07d` | DENIED `VERSION_MISMATCH`, bound to version 1 |
| revoke | `0xee2a340f20d2a96ed5623ec8093be6a451ae88dba24d0aa662627338445ac7fb` | REVOKED |
| request after revocation | `0x189eb0bf362fab1e695322eab866636fc2323011ca2a6bce0dd5dc120260e52f` | DENIED `MANDATE_REVOKED` |

### Material change — mandate #2, "Northwind Compute capacity"

Evidence: [`demo/northwind-compute/acceptable-use.md`](../demo/northwind-compute/acceptable-use.md)
served by raw.githubusercontent.com — a **demonstration page, not a real provider**, labelled as
such in its first lines. The harness edited it with real commits, waited for the CDN's max-age to
pass and for the page to be served steadily, then requested again. Validators fetched it
themselves each time.

| Page state (commit) | Request transaction | Decision | Snapshot |
|---|---|---|---|
| inference permitted (initial) | `0x860544bcdc0b71a114ad1a1d79f8e93771dfadd77e34da1b5c69cadc5b56f908` | **AUTHORIZED** | #2 — baseline |
| billing sentence changed only (`9162b2e`) | `0x1bb4a8f72a0c86227013de05d8d15bd847eff1e84694886ab5a7e467848aa9db` | **AUTHORIZED**, `material_change = false` | #3 — new baseline |
| inference prohibited (`44d8d47`) | `0x2150de44eaef792f4243ecea3c899eb15f5b89f389a8b72afa11d0b780030b44` | **REASSESS_REQUIRED** `MATERIAL_CHANGE`, affected `intended_use_permitted`, baseline #3 | #4 |
| inference permitted again (`d650465`) | `0x6b79c93670d2e8181bfc71fc0da8697de2ebd5a2ad49cd848d719ad737eb4f83` | **AUTHORIZED** | #5 |

The second row is the negative control: the page's bytes changed, the condition did not, and the
authorization held.

## Run 2 — through the application (browser)

The frontend (`pnpm dev`, configured with the deployment of record) driven step by step on
15 Sep 2026, 12:08–12:38 UTC. Record read back from the chain afterwards:
[`app-e2e.json`](app-e2e.json) (`python scripts/record_app_e2e.py`).

**About the wallet.** The browser used has no wallet extension, so an EIP-6963 provider was
injected into the page as a **test harness**: a throwaway key generated in the page, funded from
the StudioNet faucet, signing `eth_sendTransaction` locally. It is not part of the app and is not in
the repository. The app's own code path was the production one: it discovered the wallet through
EIP-6963 by its announced name, ran its network and contract checks, and sent every write through
genlayer-js `writeContract` with the connected address and that provider. Principal and agent were
the same wallet, `0x31E9A0635fd73C14669Eb70150B1eCf2583abAAc`, which the app states explicitly on the
review step.

### Scenario A — authorized purchase

| # | Step | What the app showed | Chain |
|---|---|---|---|
| 1 | Open the application | overview with live totals read from `get_protocol_info`; no "not verified" notice | — |
| 2 | Connect wallet | dialog listed "E2E Test Wallet"; header shows `0x31E9…bAAc`; no wrong-network notice | chain 61999 |
| 3–11 | Wizard: agent, action Purchase + intended use, target, limit $5,000 USD, expiry 30 days, conditions *terms compatible* and *intended use permitted*, source S1 = demo policy (Policy) | each step validated before the next | — |
| 12 | Review | the full summary, principal = agent notice | — |
| 13–14 | Create mandate, confirm | lifecycle ladder: wallet signature → submitted → processing → consensus → decision → finalized; redirected to mandate #3 | `0xc120ff2932130b7017d960b20734ad7b5b69d1029a5dbec335fffa4efebe5a2e` FINALIZED |
| 15–16 | Open mandate, request $4,700 | preflight preview: all eight checks passing; "GenLayer will evaluate the external conditions…" | — |
| 17–20 | Confirm, watch consensus, decision, finalization | ladder to finalized | `0x25bfa2abe89f3abb9dbc0e5192cdb2952b21f8c6a7e44bc2a61e11ddcb7fca03` FINALIZED |
| 21–30 | Open receipt #11 | **AUTHORIZED**; mandate #3 v1, request #11; agent; Purchase; $4,700.00 of up to $5,000.00; conditions ticked; snapshot #6 with both quotes from S1; consensus transaction `0x25bfa2ab…7fca03`, GenLayer status Finalized, final state read "Matches this decision" | request #11 |

### Scenario B — a relevant external condition changes

| # | Step | What happened | Chain |
|---|---|---|---|
| 1–3 | Mandate #3 with its baseline from request #11 | receipt #11 is the authorization | snapshot #6 |
| 4 | The policy changes | commit `f16bd1d` "demo: Northwind prohibits AI inference (in-app E2E)" | raw.githubusercontent.com served the new page |
| 5–7 | Request $4,700 again, confirm, wait | ladder to finalized | `0x7313f27e429c345526d40ea2adfebc74715db44a20375b921a4f3bc83f9112cf` → request #12 |
| — | A second identical request was sent by the operator's click landing on the button as the transaction dock closed (the dock was changed afterwards so it no longer moves under a pointer) | also recorded | `0x0159121348c7cc49a09ec2d004a2c64306114bb89a3e2af6f4bef05505d0d9db` → request #13 |
| 8–9 | Receipts #12 and #13 | **REASSESS REQUIRED**, material change Yes, affected condition *Intended use permitted*, the "prohibited" quote from S1, snapshots #7 / #8, evaluation time, consensus transaction, Finalized | requests #12, #13 |
| — | Policy restored | commit `c4731cb` | — |
| — | "Request fresh assessment" on receipt #13 | mandate page opened with action, target and amount pre-filled; request sent | `0xdafbe2f91c88b72127af69a7c4e6fea9583f9606364495b7971a81050b8a5880` |
| — | Decision shown in the request panel and receipt #14 | **AUTHORIZED**, snapshot #9 | request #14 |

All five app transactions are FINALIZED with `MAJORITY_AGREE` and leader execution `SUCCESS`
([`app-e2e.json`](app-e2e.json)).

**Key verification:** MANDATE did not reuse the authorization of request #11 after the condition
that justified it changed; it read the page again and recorded REASSESS_REQUIRED.

## Manual procedure with your own wallet

Repeat Run 2 with MetaMask, Rabby or Trust Wallet:

1. Open the application and connect the wallet; accept the prompt to switch to GenLayer StudioNet
   (chain 61999) if shown. Fund the address from the StudioNet faucet if it has no GEN.
2. **Scenario A:** New mandate → your address as agent (or a second wallet you control) → Purchase,
   intended use → target → limit and expiry → conditions → an evidence source whose content you are
   confident permits the use → Review → Create mandate → confirm in the wallet → wait for the ladder.
3. On the mandate page request an amount below the limit → confirm → wait for the decision and for
   Finalized → open the receipt and check mandate id, version, agent, action, amount, conditions,
   snapshot, transaction and final decision. Expected: AUTHORIZED.
4. **Scenario B:** use a mandate whose source you can change (for example a page in your own
   repository), obtain AUTHORIZED, change the page so the condition no longer holds, wait for the
   page to be served changed, request again. Expected: REASSESS_REQUIRED with material change, or
   DENIED on a version that was never authorized.

## Reviewer verification — without trusting the frontend

Did the frontend invent this authorization? Check it against the chain:

```bash
python scripts/inspect.py 0x5344bEae1A09c674831B174eD6BD077a5d7e58ba --mandate 3 --request 13
```

prints, read from StudioNet only: the byte comparison of the deployed code with
`contracts/mandate.py`; the schema; the mandate's principal, agent, action, target, limits, expiry,
conditions, evidence sources and every version; every request under it; and receipt #13 read from
`LATEST_FINAL` state — the request, the version terms it was decided under, and its evidence
snapshot. The transaction and its consensus can be checked on the explorer or with
`eth_getTransactionByHash`. The authoritative decision is the one stored by the Intelligent
Contract; the interface only displays it.

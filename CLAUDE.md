# MANDATE — working notes for coding agents

Conditional authorization for autonomous agents on GenLayer. The Intelligent Contract decides; the
frontend reads and helps people sign. Keep it that way.

## Layout

- `contracts/mandate.py` — the only contract. Pinned runner `py-genlayer:1jb45aa8…`; never use
  `test`/`latest` aliases.
- `tests/direct/` — gltest direct mode (real GenVM runner, mocked web/LLM). Mocks are test fixtures only.
- `tests/integration/` — live StudioNet suite; phases run once each; writes `docs/live-e2e.json`.
- `frontend/` — Next.js 16 App Router, pnpm, Tailwind 4. Contract access in `lib/genlayer/mandate.ts`,
  view shapes in `types/mandate.ts`, every on-screen word about contract state in `lib/utils/present.ts`.
- `scripts/inspect.py` — byte-verify a deployment and record its schema; `scripts/mutate.py` — mutation sweep.
- `demo/northwind-compute/acceptable-use.md` — a labelled demonstration evidence page the live
  material-change arc edits with git. Never present it as a real provider.

## Commands

```bash
genvm-lint check contracts/mandate.py --json
python -m pytest tests/direct -v
python scripts/mutate.py
SKIP_INTEGRATION=0 python -m pytest tests/integration -v -s
pnpm --dir frontend typecheck && pnpm --dir frontend lint && pnpm --dir frontend test && pnpm --dir frontend build
python scripts/inspect.py <address> --write-deployment
```

On Windows set `PYTHONUTF8=1` for genvm-lint.

## Rules that must survive every change

- The model returns findings with quotes, never a decision; `_derive` decides.
- Validators compare every stored field (`_fingerprint`) and check stored quotes against their own
  fetch (`_quotes_hold`). A new stored field goes into one of those or it is a consensus hole.
- No storage write before `_assess` returns; fail closed (REASSESS_REQUIRED or revert), never AUTHORIZED.
- Permission checks live in the contract against the signer; recorded accounts are signers.
- Views stay paginated (≤ 50); no full scans.
- After changing the contract: lint, direct tests, mutation sweep, redeploy, `inspect.py
  --write-deployment`, bump `NEXT_PUBLIC_MANDATE_CONTRACT` everywhere it appears (CI, `.env.example`, README, docs).
- The frontend never invents a receipt field, a validator count or a transaction hash.

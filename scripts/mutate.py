"""Mutation sweep: break one guard at a time in a scratch copy of the
contract and require the direct suite to fail. A surviving mutant is a guard
no test holds.

    python scripts/mutate.py
"""
import os
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "contracts" / "mandate.py").read_text(encoding="utf-8")

MUTANTS = [
    ("agent check removed",
     'if self._sender() != str(m.agent).lower():\n            raise gl.vm.UserError(f"{ERROR_EXPECTED} only the mandate\'s agent',
     'if False:\n            raise gl.vm.UserError(f"{ERROR_EXPECTED} only the mandate\'s agent'),
    ("update principal check removed",
     'if self._sender() != str(m.principal).lower():\n            raise gl.vm.UserError(f"{ERROR_EXPECTED} only the principal can update',
     'if False:\n            raise gl.vm.UserError(f"{ERROR_EXPECTED} only the principal can update'),
    ("revoke principal check removed",
     'if self._sender() != str(m.principal).lower():\n            raise gl.vm.UserError(f"{ERROR_EXPECTED} only the principal can revoke',
     'if False:\n            raise gl.vm.UserError(f"{ERROR_EXPECTED} only the principal can revoke'),
    ("revoked passes preflight", '("mandate_active", mandate_status == M_ACTIVE,', '("mandate_active", True,'),
    ("expiry off by one", 'now < int(terms["expires_at"])', 'now <= int(terms["expires_at"])'),
    ("version not checked", 'requested_version == current_version, R_VERSION', 'True, R_VERSION'),
    ("action not checked", 'action == terms["action_type"]', 'True'),
    ("target not checked", '_norm_target(target) == _norm_target(terms["target"])', 'True'),
    ("currency not checked", 'currency == terms["currency"]', 'True'),
    ("amount limit inclusive broken", '0 < amount <= int(terms["max_amount"])', '0 < amount <= int(terms["max_amount"]) + 1'),
    ("amount floor removed", '0 < amount <= int(terms["max_amount"])', 'amount <= int(terms["max_amount"])'),
    ("quote grounding removed", 'and _squash(quote) in _squash(readable[source]))', ')'),
    ("quote min length removed", 'source in readable and len(quote) >= MIN_QUOTE', 'source in readable'),
    ("material change -> denied", 'decision, reason = D_REASSESS, R_MATERIAL_CHANGE', 'decision, reason = D_DENIED, R_MATERIAL_CHANGE'),
    ("violation -> authorized", 'decision, reason = D_DENIED, R_CONDITION_VIOLATED', 'decision, reason = D_AUTHORIZED, R_CONDITION_VIOLATED'),
    ("unverified tolerated", 'elif unverified:\n        decision, reason = D_REASSESS, R_EVIDENCE_INCONCLUSIVE', 'elif False:\n        decision, reason = D_REASSESS, R_EVIDENCE_INCONCLUSIVE'),
    ("partial readability tolerated", 'elif set(readable_ids) != set(all_ids):\n        decision, reason = D_REASSESS, R_EVIDENCE_UNAVAILABLE', 'elif False:\n        decision, reason = D_REASSESS, R_EVIDENCE_UNAVAILABLE'),
    ("fingerprint ignores finding", '"finding": c["finding"], "source": c["source"]}', '"source": c["source"]}'),
    ("fingerprint ignores material change", '"material_change": res["material_change"],\n        "affected', '"affected'),
    ("fingerprint ignores readability", '"sources_readable": res["sources_readable"],\n    })', '    })'),
    ("validator skips quotes", 'if not quotes_hold(leader, readable):', 'if False:'),
    ("unverified rows may carry quotes", 'if c["source"] or c["quote"]:\n                return False', 'if False:\n                return False'),
    ("replay allowed", 'if replay_key in self.request_keys:', 'if False:'),
    ("baseline not recorded", 'self.baselines[baseline_key] = u256(int(snapshot_id))', 'pass'),
    ("baseline ignored", 'baseline = {c["key"]: c["finding"] for c in snap["conditions"]}', 'baseline = None'),
    # Not listed: removing the AUTHORIZED-consistency guard in
    # request_authorization. `_derive` never returns AUTHORIZED with a
    # non-SATISFIED condition, and validators must reproduce `_derive`, so no
    # input reaches that guard — the mutant is equivalent. It stays in the
    # contract as a boundary check (docs/security.md).
    ("fence sanitising removed", 's = FENCE.sub("", str(text or ""))', 's = str(text or "")'),
    ("duplicate url allowed", 'if norm in seen_urls:', 'if False:'),
]


def main() -> int:
    survivors = []
    with tempfile.TemporaryDirectory() as tmp:
        for name, old, new in MUTANTS:
            if SOURCE.count(old) != 1:
                print(f"BAD MUTANT {name!r}: pattern found {SOURCE.count(old)} times")
                survivors.append(name)
                continue
            path = pathlib.Path(tmp) / "mandate.py"
            path.write_text(SOURCE.replace(old, new), encoding="utf-8")
            env = {**os.environ, "MANDATE_CONTRACT": str(path), "PYTHONUTF8": "1"}
            proc = subprocess.run([sys.executable, "-m", "pytest", "tests/direct", "-q", "-x", "-p", "no:cacheprovider"],
                                  cwd=ROOT, env=env, capture_output=True, text=True)
            killed = proc.returncode != 0
            print(f"{'killed  ' if killed else 'SURVIVED'} {name}")
            if not killed:
                survivors.append(name)
    print(f"\n{len(MUTANTS) - len(survivors)}/{len(MUTANTS)} mutants killed")
    return 1 if survivors else 0


if __name__ == "__main__":
    sys.exit(main())

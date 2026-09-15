"""Live integration harness: GenLayer StudioNet, real validators, real web.

    SKIP_INTEGRATION=0 pytest tests/integration -v -s
    (the gltest wrapper collects the same tests: SKIP_INTEGRATION=0 gltest tests/integration -v -s)

No keys are needed. The harness creates throwaway principal, agent and
stranger accounts, funds them from the StudioNet faucet, deploys
contracts/mandate.py from the working tree (or reuses MANDATE_CONTRACT), and
drives two mandates:

  REAL EVIDENCE     "GitHub Codespaces" — the service_available condition is read
                    from GitHub's public status API (githubstatus.com). The harness
                    reads the same API itself before and after the request, so the
                    assertion follows reality: AUTHORIZED when Codespaces was
                    operational throughout, never AUTHORIZED otherwise.

  MATERIAL CHANGE   "Northwind Compute" — a DEMONSTRATION provider whose acceptable
                    use policy is demo/northwind-compute/acceptable-use.md in this
                    repository, served by raw.githubusercontent.com. The harness
                    edits that page with real git commits between requests:
                      1. permitted            -> AUTHORIZED (baseline)
                      2. billing wording only -> AUTHORIZED, no material change
                                                 (the negative control)
                      3. inference prohibited -> REASSESS_REQUIRED, MATERIAL_CHANGE
                      4. permitted again      -> AUTHORIZED (fresh assessment)
                    The page is a controlled fixture and says so on its face; the
                    change it undergoes is nonetheless a real public change the
                    validators fetch for themselves. Pushing needs git credentials
                    for the repository (MANDATE_DEMO_PUSH=0 skips this arc).

Phases run lazily, in order, exactly once; a failed phase fails every test
that needs it without re-running. Every transaction — hash, status, consensus,
execution result and the contract's own refusal text — goes to
docs/live-e2e.json.
"""
import base64
import json
import os
import pathlib
import subprocess
import time
import urllib.request

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "contracts" / "mandate.py"
RECORD = ROOT / "docs" / "live-e2e.json"
DEMO_FILE = ROOT / "demo" / "northwind-compute" / "acceptable-use.md"
DEMO_URL = "https://raw.githubusercontent.com/Olawalter/Mandate/main/demo/northwind-compute/acceptable-use.md"
RPC = "https://studio.genlayer.com/api"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0 Safari/537.36")
LIVE = os.environ.get("SKIP_INTEGRATION", "1") == "0"
DEMO_PUSH = os.environ.get("MANDATE_DEMO_PUSH", "1") == "1"
RAW_MAX_AGE = 300

STATUS_URL = "https://www.githubstatus.com/api/v2/status.json"
COMPONENTS_URL = "https://www.githubstatus.com/api/v2/components.json"

REAL_TERMS = {
    "agent_label": "Procurement Agent", "action_type": "PURCHASE", "target": "GitHub Codespaces compute",
    "max_amount": 500_000, "currency": "USD", "intended_use": "Cloud development environments for the engineering team",
    "conditions": [{"key": "service_available",
                    "requirement": "GitHub reports the Codespaces component as operational."}],
    "sources": [{"url": COMPONENTS_URL, "purpose": "PROVIDER_STATUS"},
                {"url": STATUS_URL, "purpose": "PROVIDER_STATUS"}],
}
DEMO_TERMS = {
    "agent_label": "Procurement Agent", "action_type": "PURCHASE", "target": "Northwind Compute capacity",
    "max_amount": 500_000, "currency": "USD", "intended_use": "Run AI inference workloads",
    "conditions": [
        {"key": "terms_compatible",
         "requirement": "Northwind's current terms allow business customers to purchase compute capacity."},
        {"key": "intended_use_permitted",
         "requirement": "Northwind's acceptable use policy permits AI inference workloads."},
    ],
    "sources": [{"url": DEMO_URL, "purpose": "POLICY"}],
}

POLICY_HEADER = DEMO_FILE.read_text(encoding="utf-8").split("Effective for all compute plans.")[0] \
    if DEMO_FILE.exists() else ""


def demo_policy(inference: str, billing: str) -> str:
    return (POLICY_HEADER + "Effective for all compute plans.\n\n## Customers\n\n"
            "Business customers may purchase compute capacity under these terms.\n\n"
            f"## Permitted workloads\n\nAI inference workloads are {inference} on all compute plans.\n\n"
            f"## Billing\n\n{billing}\n")


POLICY_PERMITTED = demo_policy("permitted", "Billing is monthly in arrears.")
POLICY_BILLING = demo_policy("permitted", "Billing is quarterly in advance.")
POLICY_PROHIBITED = demo_policy("prohibited", "Billing is quarterly in advance.")


def rpc(method, params, attempts=8):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    for i in range(attempts):
        try:
            req = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json", "User-Agent": UA})
            out = json.load(urllib.request.urlopen(req, timeout=120))
            if "error" in out:
                raise RuntimeError(f"{method}: {out['error']}")
            return out["result"]
        except RuntimeError:
            raise
        except Exception:
            if i == attempts - 1:
                raise
            time.sleep(5 + 5 * i)


def fetch(url) -> bytes:
    req = urllib.request.Request(f"{url}", headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    return urllib.request.urlopen(req, timeout=60).read()


def codespaces_operational() -> bool:
    data = json.loads(fetch(COMPONENTS_URL))
    return any(c.get("name") == "Codespaces" and c.get("status") == "operational" for c in data["components"])


def _patch_transport():
    """The public RPC drops connections and serves CDN error pages mid-poll.
    Retry transport failures only; a JSON-RPC error is a real answer."""
    from genlayer_py.provider.provider import GenLayerProvider
    original = GenLayerProvider.make_request

    def make_request(self, method, params):
        for i in range(8):
            try:
                return original(self, method, params)
            except Exception as e:
                text = str(e)
                transient = any(s in text for s in (
                    "Connection", "timed out", "SSL", "502", "503", "504", "429",
                    "<!DOCTYPE", "invalid JSON", "RemoteDisconnected", "reset"))
                if not transient or i == 7:
                    raise
                time.sleep(5 + 5 * i)
    GenLayerProvider.make_request = make_request


def _hex(tx):
    return tx.hex() if hasattr(tx, "hex") else str(tx)


def _utc():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _decode_payload(result):
    """A refusal's text: the leader result is base64 with a leading code byte."""
    payload = result.get("payload") if isinstance(result, dict) else result
    if isinstance(payload, str):
        try:
            raw = base64.b64decode(payload, validate=True)
            return raw[1:].decode("utf-8", "replace") if raw else ""
        except Exception:
            return payload
    return str(payload or "")


class Live:
    def __init__(self):
        from eth_account import Account
        from genlayer_py import create_client
        from genlayer_py.chains import studionet
        _patch_transport()
        self._create_client, self._chain = create_client, studionet
        self.principal = Account.create()
        self.agent = Account.create()
        self.stranger = Account.create()
        self.reader = create_client(chain=studionet, account=Account.create())
        self.record = {"network": "GenLayer StudioNet", "chain_id": studionet.id, "rpc": RPC,
                       "finality_window_seconds": rpc("sim_getFinalityWindowTime", []),
                       "accounts": {"principal": self.principal.address, "agent": self.agent.address,
                                    "stranger": self.stranger.address},
                       "started_at": _utc(), "transactions": [], "mandates": {}}
        for acct in (self.principal, self.agent, self.stranger):
            rpc("sim_fundAccount", [acct.address, 10 ** 18])
        existing = os.environ.get("MANDATE_CONTRACT")
        if existing:
            self.address = existing
            self.record["deployment"] = {"address": existing, "reused": True}
        else:
            self.address, self.record["deployment"] = self._deploy()
        self.await_(lambda: self.read("get_protocol_info") is not None, "deployment")
        self.record["contract"] = self.address

    def _deploy(self):
        code = CONTRACT.read_bytes().replace(b"\r\n", b"\n")
        c = self.client(self.principal)
        tx = c.deploy_contract(code=code)
        receipt = self.wait(c, tx, "ACCEPTED")
        address = (receipt.get("data") or {}).get("contract_address")
        return address, {"address": address, "tx": _hex(tx), "consensus": receipt.get("result_name")}

    # ── plumbing ──
    def client(self, acct):
        return self._create_client(chain=self._chain, account=acct)

    def wait(self, c, tx, status):
        from genlayer_py.types import TransactionStatus
        return c.wait_for_transaction_receipt(transaction_hash=tx, status=TransactionStatus[status],
                                              interval=5000, retries=360)

    @staticmethod
    def await_(predicate, what, tries=60, pause=5):
        for _ in range(tries):
            try:
                if predicate():
                    return
            except Exception:
                pass
            time.sleep(pause)
        raise TimeoutError(f"timed out waiting for {what}")

    def role(self, acct):
        return {id(self.principal): "principal", id(self.agent): "agent",
                id(self.stranger): "stranger"}.get(id(acct), "other")

    def read(self, fn, *args, final=False):
        from genlayer_py.types import TransactionHashVariant
        variant = TransactionHashVariant.LATEST_FINAL if final else TransactionHashVariant.LATEST_NONFINAL
        return self.reader.read_contract(address=self.address, function_name=fn, args=list(args),
                                         transaction_hash_variant=variant)

    def tx_facts(self, tx_hash) -> dict:
        t = rpc("eth_getTransactionByHash", [tx_hash]) or {}
        votes = (t.get("consensus_data") or {}).get("votes") or {}
        return {"status": t.get("status"), "consensus": t.get("result_name"),
                "votes": sorted(votes.values()) if isinstance(votes, dict) else votes,
                "rotations": len(((t.get("consensus_history") or {}).get("consensus_results") or []))}

    def write(self, acct, fn, *args, wait="ACCEPTED", step=None, mandate=None):
        c = self.client(acct)
        tx = c.write_contract(address=self.address, function_name=fn, args=list(args), value=0)
        receipt = self.wait(c, tx, wait)
        leader = ((receipt.get("consensus_data") or {}).get("leader_receipt") or [{}])[0]
        result = leader.get("result") or {}
        entry = {"step": step or fn, "mandate": mandate, "function": fn, "caller": self.role(acct),
                 "tx": _hex(tx), "status": receipt.get("status_name"), "consensus": receipt.get("result_name"),
                 "execution": leader.get("execution_result"),
                 "refused": leader.get("execution_result") not in (None, "SUCCESS")}
        if entry["refused"]:
            entry["refusal"] = _decode_payload(result)
        self.record["transactions"].append(entry)
        print(f"  {entry['step']:<52} {entry['tx'][:18]}…  {entry['status']} {entry['consensus']}  "
              f"{entry['execution']}" + (f"  REFUSED: {entry['refusal'][:110]}" if entry["refused"] else ""))
        return entry

    def save(self):
        self.record["finished_at"] = _utc()
        RECORD.parent.mkdir(parents=True, exist_ok=True)
        RECORD.write_text(json.dumps(self.record, indent=2, default=str) + "\n", encoding="utf-8")


def publish_demo_policy(text: str, message: str) -> dict:
    """Commit and push a new demo policy page, then wait until the public URL
    serves it steadily and the CDN's max-age has passed, so validators fetching
    from any edge read the new page."""
    current = DEMO_FILE.read_text(encoding="utf-8") if DEMO_FILE.exists() else ""
    commit = None
    if current.replace("\r\n", "\n") != text:
        DEMO_FILE.write_text(text, encoding="utf-8", newline="\n")
        subprocess.run(["git", "add", str(DEMO_FILE)], cwd=ROOT, check=True)
        subprocess.run(["git", "commit", "-q", "-m", message, "--", str(DEMO_FILE)], cwd=ROOT, check=True)
        subprocess.run(["git", "push", "-q", "origin", "HEAD:main"], cwd=ROOT, check=True)
        commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, check=True,
                                capture_output=True, text=True).stdout.strip()
    pushed_at = time.time()
    want = text.encode("utf-8")
    Live.await_(lambda: fetch(DEMO_URL) == want, "demo policy on raw.githubusercontent.com", tries=80, pause=10)
    if commit:
        remaining = pushed_at + RAW_MAX_AGE + 30 - time.time()
        if remaining > 0:
            print(f"  … waiting {int(remaining)}s for every CDN edge to expire the old page")
            time.sleep(remaining)
    for _ in range(3):
        assert fetch(DEMO_URL) == want
        time.sleep(5)
    print(f"  demo policy now: {message} ({commit or 'unchanged'})")
    return {"message": message, "commit": commit, "url": DEMO_URL, "served_at": _utc()}


class World:
    def __init__(self, live: Live):
        self.live = live
        self.done = set()
        self.failed = {}
        self.ids = {}
        self.keys = iter(range(1, 10_000))

    def _once(self, name, fn):
        if name in self.failed:
            raise RuntimeError(f"phase {name} already failed: {self.failed[name]}")
        if name not in self.done:
            print(f"\nPHASE {name}")
            try:
                fn()
            except Exception as e:
                self.failed[name] = f"{type(e).__name__}: {str(e)[:300]}"
                self.live.record.setdefault("failed_phases", {})[name] = self.failed[name]
                raise
            self.done.add(name)

    def _create(self, name, terms, agent=None) -> str:
        live = self.live
        before = live.read("get_protocol_info")["mandate_count"]
        expires = int(time.time()) + 7 * 86400
        live.write(live.principal, "create_mandate", (agent or live.agent).address, terms["agent_label"],
                   terms["action_type"], terms["target"], terms["max_amount"], terms["currency"], expires,
                   terms["intended_use"], json.dumps(terms["conditions"]), json.dumps(terms["sources"]),
                   step=f"create_mandate [{name}]", mandate=name)
        mid = str(before + 1)
        m = live.read("get_mandate", mid)
        assert m["terms"]["target"] == terms["target"] and m["agent"].lower() == (agent or live.agent).address.lower()
        self.ids[name] = mid
        live.record["mandates"][name] = {"mandate_id": mid, "terms": m["terms"], "requests": []}
        return mid

    def request(self, name, step, version=1, amount=470_000, target=None, action="PURCHASE", currency="USD",
                key=None, acct=None) -> dict:
        live = self.live
        mid = self.ids[name]
        terms = live.record["mandates"][name]["terms"]
        key = key or f"live-{name}-{next(self.keys)}"
        entry = live.write(acct or live.agent, "request_authorization", mid, version, action,
                           target or terms["target"], amount, currency, key, step=step, mandate=name)
        out = {"tx": entry["tx"], "request_key": key, "entry": entry}
        if not entry["refused"]:
            items = live.read("list_mandate_requests", mid, 0, 1)["items"]
            assert items and items[0]["request_key"] == key
            out["request"] = items[0]
            if items[0]["snapshot_id"]:
                out["snapshot"] = live.read("get_evidence_snapshot", str(items[0]["snapshot_id"]))
            print(f"    -> {items[0]['decision']} {items[0]['reason_code']} material_change={items[0]['material_change']}")
        live.record["mandates"][name]["requests"].append(
            {k: v for k, v in out.items() if k != "entry"} | {"step": step})
        return out

    # ── real evidence ──
    def real(self):
        def run():
            live = self.live
            self._create("real_evidence", REAL_TERMS)
            before = codespaces_operational()
            r = self.request("real_evidence", "request_authorization [real evidence]")
            after = codespaces_operational()
            r["codespaces_operational_before_and_after"] = [before, after]
            live.record["mandates"]["real_evidence"]["reality_check"] = [before, after]
            self.real_result = r
        self._once("real", run)
        return self.real_result

    # ── deterministic constraints and access control, live ──
    def constraints(self):
        self.real()

        def run():
            live = self.live
            out = {}
            out["stranger"] = self.request("real_evidence", "request by a stranger (refused)", acct=live.stranger)
            out["principal_not_agent"] = self.request("real_evidence", "request by the principal (refused)",
                                                      acct=live.principal)
            out["over_limit"] = self.request("real_evidence", "request above the limit", amount=500_001)
            out["wrong_target"] = self.request("real_evidence", "request for another target",
                                               target="Some Other Compute")
            out["wrong_action"] = self.request("real_evidence", "request for another action", action="SUBSCRIBE")
            key = self.real_result["request_key"]
            out["replay"] = self.request("real_evidence", "replay of the first request_key (refused)", key=key)
            out["stranger_update"] = live.write(
                live.stranger, "update_mandate", self.ids["real_evidence"], 1, "x", "PURCHASE", "t", 1, "USD",
                int(time.time()) + 86400, "use", json.dumps(REAL_TERMS["conditions"]),
                json.dumps(REAL_TERMS["sources"]), step="update by a stranger (refused)", mandate="real_evidence")
            out["stranger_revoke"] = live.write(live.stranger, "revoke_mandate", self.ids["real_evidence"],
                                                step="revoke by a stranger (refused)", mandate="real_evidence")
            t = REAL_TERMS
            live.write(live.principal, "update_mandate", self.ids["real_evidence"], 1, t["agent_label"],
                       t["action_type"], t["target"], 400_000, t["currency"], int(time.time()) + 7 * 86400,
                       t["intended_use"], json.dumps(t["conditions"]), json.dumps(t["sources"]),
                       step="update_mandate -> version 2", mandate="real_evidence")
            out["version_after_update"] = live.read("get_mandate", self.ids["real_evidence"])["version"]
            out["stale_version"] = self.request("real_evidence", "request naming version 1 after update",
                                                version=1, amount=100)
            live.write(live.principal, "revoke_mandate", self.ids["real_evidence"],
                       step="revoke_mandate", mandate="real_evidence")
            out["revoked"] = self.request("real_evidence", "request after revocation", version=2, amount=100)
            out["version_1_terms"] = live.read("get_mandate_version", self.ids["real_evidence"], 1)
            self.constraint_results = out
        self._once("constraints", run)
        return self.constraint_results

    # ── material change ──
    def material(self):
        def run():
            if not DEMO_PUSH:
                pytest.skip("MANDATE_DEMO_PUSH=0: the material-change arc edits the demo page with git")
            live = self.live
            out = {"pages": []}
            out["pages"].append(publish_demo_policy(POLICY_PERMITTED, "demo: Northwind permits AI inference"))
            self._create("material_change", DEMO_TERMS)
            out["baseline"] = self.request("material_change", "request [policy permits inference]")
            out["pages"].append(publish_demo_policy(POLICY_BILLING, "demo: Northwind changes billing wording only"))
            out["irrelevant"] = self.request("material_change", "request [billing wording changed]")
            out["pages"].append(publish_demo_policy(POLICY_PROHIBITED, "demo: Northwind prohibits AI inference"))
            out["material"] = self.request("material_change", "request [policy prohibits inference]")
            out["pages"].append(publish_demo_policy(POLICY_PERMITTED, "demo: Northwind permits AI inference again"))
            out["fresh"] = self.request("material_change", "request [fresh assessment, permitted again]")
            live.record["mandates"]["material_change"]["pages"] = out["pages"]
            self.material_results = out
        self._once("material", run)
        return self.material_results

    # ── finality ──
    def finalized(self):
        self.real()

        def run():
            live = self.live
            r = self.real_result
            live.await_(lambda: live.tx_facts(r["tx"])["status"] == "FINALIZED", "decision finality",
                        tries=120, pause=10)
            facts = live.tx_facts(r["tx"])
            rid = r["request"]["request_id"]
            final_read = live.read("get_decision_receipt", rid, final=True)
            live.record["finality"] = {"tx": r["tx"], "facts": facts, "request_id": rid,
                                       "final_receipt": final_read}
            self.final = {"facts": facts, "receipt": final_read}
        self._once("finality", run)
        return self.final


@pytest.fixture(scope="session")
def live():
    if not LIVE:
        pytest.skip("set SKIP_INTEGRATION=0 to run against StudioNet")
    harness = Live()
    yield harness
    harness.save()


@pytest.fixture(scope="session")
def world(live):
    return World(live)

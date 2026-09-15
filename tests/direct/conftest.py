"""Shared fixtures for the MANDATE direct suite.

Direct mode (the official `genlayer-test` runner) executes the contract in a
real GenVM Python runner. Transaction time is set with `direct_vm.warp()`,
the web is served through `direct_vm.mock_web`, and the model through
`direct_vm.mock_llm`. These are test fixtures, never production behaviour:
they let the suite prove what the CONTRACT decides from a given reading.
Whether a real model reads a real page correctly is the integration suite's
job.

A model mock returns per-condition FINDINGS with quotes, never a decision:
the contract accepts no decision from the model.
"""
import datetime
import json
import os
import pathlib
import re

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
# MANDATE_CONTRACT points the suite at another copy (used by the mutation sweep).
CONTRACT = pathlib.Path(os.environ.get("MANDATE_CONTRACT") or ROOT / "contracts" / "mandate.py")

HOUR = 3600
DAY = 86400
T0 = 1_789_430_400                       # 2026-09-15T00:00:00Z — every suite starts here
EXPIRES = T0 + 5 * DAY
WITHIN = T0 + HOUR

STATUS_URL = "https://status.fixture-cloud.test/api/v2/status.json"
POLICY_URL = "https://fixture-cloud.test/legal/acceptable-use"

CONDITIONS = [
    {"key": "provider_eligible", "requirement": "The provider is not suspended or sanctioned."},
    {"key": "service_available", "requirement": "The compute service reports operational status."},
    {"key": "terms_compatible", "requirement": "Current terms allow business customers to purchase compute."},
    {"key": "intended_use_permitted", "requirement": "The acceptable-use policy permits AI inference workloads."},
]
SOURCES = [
    {"url": STATUS_URL, "purpose": "PROVIDER_STATUS"},
    {"url": POLICY_URL, "purpose": "POLICY"},
]

TERMS = dict(agent_label="Procurement Agent", action_type="PURCHASE", target="Fixture Cloud compute",
             max_amount=500_000, currency="USD", expires_at=EXPIRES,
             intended_use="Run AI inference workloads for internal analytics")

STATUS_BODY = json.dumps({"page": {"name": "Fixture Cloud"},
                          "status": {"indicator": "none", "description": "All Systems Operational"},
                          "account": "Provider standing: active, not suspended"}).encode()
POLICY_BODY = (b"<!doctype html><html><body><h1>Acceptable Use Policy</h1>"
               b"<p>Business customers may purchase compute capacity under these terms.</p>"
               b"<p>AI inference workloads are permitted on all compute plans.</p>"
               b"<p>Billing is monthly in arrears.</p>"
               b"<script>track()</script></body></html>")
POLICY_BODY_BILLING_CHANGED = POLICY_BODY.replace(b"Billing is monthly in arrears.",
                                                  b"Billing is now quarterly in advance.")
POLICY_BODY_PROHIBITED = (b"<!doctype html><html><body><h1>Acceptable Use Policy</h1>"
                          b"<p>Business customers may purchase compute capacity under these terms.</p>"
                          b"<p>AI inference workloads are prohibited on all compute plans.</p>"
                          b"<p>Billing is monthly in arrears.</p></body></html>")

SOURCES_OK = {STATUS_URL: (200, STATUS_BODY), POLICY_URL: (200, POLICY_BODY)}

Q_ELIGIBLE = "Provider standing: active, not suspended"
Q_AVAILABLE = "All Systems Operational"
Q_TERMS = "Business customers may purchase compute capacity under these terms."
Q_USE = "AI inference workloads are permitted on all compute plans."
Q_USE_PROHIBITED = "AI inference workloads are prohibited on all compute plans."


# ─── time ────────────────────────────────────────────────────────────────────

def iso(unix_seconds: int) -> str:
    return datetime.datetime.fromtimestamp(
        int(unix_seconds), tz=datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def warp_to(direct_vm, unix_seconds: int) -> None:
    direct_vm.warp(iso(unix_seconds))


# ─── findings (what a model reader reports) ──────────────────────────────────

def cond(key, finding="SATISFIED", source="", quote=""):
    return {"key": key, "finding": finding, "source": source, "quote": quote}


def answer(*conditions) -> str:
    return json.dumps({"reasoning": "per condition, from the fences", "conditions": list(conditions)})


ALL_SATISFIED = answer(
    cond("provider_eligible", "SATISFIED", "S1", Q_ELIGIBLE),
    cond("service_available", "SATISFIED", "S1", Q_AVAILABLE),
    cond("terms_compatible", "SATISFIED", "S2", Q_TERMS),
    cond("intended_use_permitted", "SATISFIED", "S2", Q_USE),
)

USE_PROHIBITED = answer(
    cond("provider_eligible", "SATISFIED", "S1", Q_ELIGIBLE),
    cond("service_available", "SATISFIED", "S1", Q_AVAILABLE),
    cond("terms_compatible", "SATISFIED", "S2", Q_TERMS),
    cond("intended_use_permitted", "VIOLATED", "S2", Q_USE_PROHIBITED),
)


def mock_round(direct_vm, llm_json=ALL_SATISFIED, sources=None) -> None:
    """Register what the sources serve and what a model reader reports.
    Mocks are first-registered-wins, so clear first."""
    direct_vm.clear_mocks()
    for url, (status, body) in (sources if sources is not None else SOURCES_OK).items():
        direct_vm.mock_web("^" + re.escape(url) + "$", {"status": status, "body": body})
    if llm_json is not None:
        direct_vm.mock_llm(r".*reader on a GenLayer validator panel for MANDATE.*", llm_json)


def record_prompts(direct_vm) -> list:
    seen = []
    original = direct_vm._match_llm_mock

    def recording(prompt):
        seen.append(prompt)
        return original(prompt)

    direct_vm._match_llm_mock = recording
    return seen


def record_fetches(direct_vm) -> list:
    seen = []
    original = direct_vm._match_web_mock

    def recording(url, method="GET"):
        seen.append(url)
        return original(url, method)

    direct_vm._match_web_mock = recording
    return seen


def hex_of(account) -> str:
    raw = account.as_bytes if hasattr(account, "as_bytes") else bytes(account)
    return "0x" + raw.hex()


def round_index(direct_vm) -> int:
    captured = direct_vm._captured_validators
    for i in range(len(captured) - 1, -1, -1):
        result = captured[i][0]
        if isinstance(result, dict) and "decision" in result and "conditions" in result:
            return i
    raise AssertionError("no assessment round captured")


# ─── fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def contract_path():
    return str(CONTRACT)


@pytest.fixture
def deployed(direct_vm, direct_deploy, contract_path):
    warp_to(direct_vm, T0)
    return direct_deploy(contract_path)


def create(deployed, direct_vm, principal, agent, conditions=None, sources=None, **overrides) -> str:
    terms = {**TERMS, **overrides}
    direct_vm.sender = principal
    return deployed.create_mandate(
        hex_of(agent), terms["agent_label"], terms["action_type"], terms["target"],
        terms["max_amount"], terms["currency"], terms["expires_at"], terms["intended_use"],
        json.dumps(conditions if conditions is not None else CONDITIONS),
        json.dumps(sources if sources is not None else SOURCES))


def update(deployed, direct_vm, principal, mandate_id, expected_version, conditions=None,
           sources=None, **overrides) -> int:
    terms = {**TERMS, **overrides}
    direct_vm.sender = principal
    return deployed.update_mandate(
        mandate_id, expected_version, terms["agent_label"], terms["action_type"], terms["target"],
        terms["max_amount"], terms["currency"], terms["expires_at"], terms["intended_use"],
        json.dumps(conditions if conditions is not None else CONDITIONS),
        json.dumps(sources if sources is not None else SOURCES))


_keys = iter(range(1, 10_000))


def request(deployed, direct_vm, agent, mandate_id, version=1, action="PURCHASE",
            target="Fixture Cloud compute", amount=470_000, currency="USD", key=None,
            at=WITHIN, llm_json=ALL_SATISFIED, sources=None) -> dict:
    warp_to(direct_vm, at)
    mock_round(direct_vm, llm_json, sources)
    direct_vm.sender = agent
    rid = deployed.request_authorization(mandate_id, version, action, target, amount, currency,
                                         key if key is not None else f"req-{next(_keys)}")
    return deployed.get_authorization(rid)


@pytest.fixture
def mandate(direct_vm, deployed, direct_alice, direct_bob):
    """An ACTIVE mandate: Alice is the principal, Bob the procurement agent."""
    return create(deployed, direct_vm, direct_alice, direct_bob)

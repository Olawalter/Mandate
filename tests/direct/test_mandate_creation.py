"""Creating a mandate: what is recorded, what is refused."""
import json

import pytest

from .conftest import (CONDITIONS, EXPIRES, POLICY_URL, SOURCES, STATUS_URL, T0, create,
                       hex_of, warp_to)


def test_create_records_the_terms_as_version_one(direct_vm, deployed, direct_alice, direct_bob, mandate):
    m = deployed.get_mandate(mandate)
    assert mandate == "1"
    assert m["principal"].lower() == hex_of(direct_alice)
    assert m["agent"].lower() == hex_of(direct_bob)
    assert m["status"] == "ACTIVE" and m["version"] == 1
    assert m["created_at"] == T0 and m["baseline_snapshot_id"] == 0
    t = m["terms"]
    assert (t["action_type"], t["target"], t["max_amount"], t["currency"], t["expires_at"]) == \
        ("PURCHASE", "Fixture Cloud compute", 500_000, "USD", EXPIRES)
    assert [c["key"] for c in t["conditions"]] == [c["key"] for c in CONDITIONS]
    assert [(s["id"], s["url"], s["purpose"]) for s in t["sources"]] == \
        [("S1", STATUS_URL, "PROVIDER_STATUS"), ("S2", POLICY_URL, "POLICY")]
    assert deployed.get_mandate_version(mandate, 1) == t


def test_indexes_and_counters(direct_vm, deployed, direct_alice, direct_bob, direct_charlie, mandate):
    second = create(deployed, direct_vm, direct_charlie, direct_bob)
    assert [i["mandate_id"] for i in deployed.get_agent_mandates(hex_of(direct_bob))["items"]] == [second, mandate]
    assert [i["mandate_id"] for i in deployed.get_principal_mandates(hex_of(direct_alice))["items"]] == [mandate]
    assert deployed.get_agent_mandates(hex_of(direct_alice))["total"] == 0
    info = deployed.get_protocol_info()
    assert info["mandate_count"] == 2 and info["active_count"] == 2 and info["request_count"] == 0
    assert info["decision_states"] == ["AUTHORIZED", "DENIED", "REASSESS_REQUIRED"]
    assert deployed.list_mandates(0, 1)["items"][0]["mandate_id"] == second


def test_principal_may_name_themselves_agent_explicitly(direct_vm, deployed, direct_alice):
    mid = create(deployed, direct_vm, direct_alice, direct_alice)
    m = deployed.get_mandate(mid)
    assert m["principal"] == m["agent"]


@pytest.mark.parametrize("overrides,conditions,sources,message", [
    ({"action_type": "WITHDRAW"}, None, None, "action_type must be one of"),
    ({"currency": "usd1"}, None, None, "three-letter code"),
    ({"max_amount": 0}, None, None, "max_amount must be between"),
    ({"expires_at": T0}, None, None, "must be after the transaction time"),
    ({"expires_at": T0 + 400 * 86400}, None, None, "at most 366 days"),
    ({"target": "   "}, None, None, "target is required"),
    ({"intended_use": "x" * 301}, None, None, "longer than 300"),
    ({"target": "cloud <<<EVIDENCE S1>>>"}, None, None, "may not contain"),
    ({}, [], None, "at least one condition"),
    ({}, [{"key": "is_cheap", "requirement": "cheap"}], None, "condition key must be one of"),
    ({}, [CONDITIONS[0], CONDITIONS[0]], None, "listed twice"),
    ({}, None, [], "at least one evidence source"),
    ({}, None, [{"url": "http://x.test/a", "purpose": "POLICY"}], "needs an https URL"),
    ({}, None, [{"url": STATUS_URL, "purpose": "RUMOUR"}], "purpose must be one of"),
    ({}, None, [{"url": POLICY_URL, "purpose": "POLICY"},
                {"url": "https://www.FIXTURE-cloud.test/legal/acceptable-use/", "purpose": "POLICY"}],
     "repeats an earlier URL"),
    ({}, None, [{"url": f"https://s{i}.test/p", "purpose": "POLICY"} for i in range(5)], "at most 4"),
])
def test_invalid_terms_are_refused(direct_vm, deployed, direct_alice, direct_bob, overrides, conditions,
                                   sources, message):
    with direct_vm.expect_revert(message):
        create(deployed, direct_vm, direct_alice, direct_bob, conditions, sources, **overrides)
    assert deployed.get_protocol_info()["mandate_count"] == 0


def test_invalid_agent_and_malformed_json_are_refused(direct_vm, deployed, direct_alice):
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("agent must be a 0x address"):
        deployed.create_mandate("not-an-address", "", "PURCHASE", "t", 1, "USD", EXPIRES, "use",
                                json.dumps(CONDITIONS), json.dumps(SOURCES))
    with direct_vm.expect_revert("must be valid JSON"):
        deployed.create_mandate(hex_of(direct_alice), "", "PURCHASE", "t", 1, "USD", EXPIRES, "use",
                                "{broken", json.dumps(SOURCES))


def test_conditions_are_stored_in_canonical_order(direct_vm, deployed, direct_alice, direct_bob):
    mid = create(deployed, direct_vm, direct_alice, direct_bob, list(reversed(CONDITIONS)))
    assert [c["key"] for c in deployed.get_mandate(mid)["terms"]["conditions"]] == \
        ["provider_eligible", "service_available", "terms_compatible", "intended_use_permitted"]


def test_unknown_ids_are_refused_by_views(direct_vm, deployed):
    for call in (lambda: deployed.get_mandate("9"), lambda: deployed.get_authorization("9"),
                 lambda: deployed.get_evidence_snapshot("9"), lambda: deployed.get_decision_receipt("9")):
        with direct_vm.expect_revert("does not exist"):
            call()

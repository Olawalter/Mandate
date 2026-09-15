"""Versions: every change is a new version, and history keeps its version."""
from .conftest import (ALL_SATISFIED, CONDITIONS, SOURCES, USE_PROHIBITED, POLICY_BODY_PROHIBITED,
                       POLICY_URL, STATUS_BODY, STATUS_URL, WITHIN, HOUR, request, update)


def test_update_creates_a_new_version_and_keeps_the_old(direct_vm, deployed, direct_alice, mandate):
    v1 = deployed.get_mandate_version(mandate, 1)
    assert update(deployed, direct_vm, direct_alice, mandate, 1, max_amount=900_000) == 2
    m = deployed.get_mandate(mandate)
    assert m["version"] == 2 and m["terms"]["max_amount"] == 900_000 and m["terms"]["version"] == 2
    assert deployed.get_mandate_version(mandate, 1) == v1
    assert v1["max_amount"] == 500_000 and v1["version"] == 1
    with direct_vm.expect_revert("has no version 3"):
        deployed.get_mandate_version(mandate, 3)


def test_update_requires_the_current_version(direct_vm, deployed, direct_alice, mandate):
    update(deployed, direct_vm, direct_alice, mandate, 1)
    with direct_vm.expect_revert("is at version 2, not 1"):
        update(deployed, direct_vm, direct_alice, mandate, 1, max_amount=1)
    assert deployed.get_mandate(mandate)["version"] == 2


def test_update_validates_terms_like_create(direct_vm, deployed, direct_alice, mandate):
    with direct_vm.expect_revert("action_type must be one of"):
        update(deployed, direct_vm, direct_alice, mandate, 1, action_type="SELL")
    assert deployed.get_mandate(mandate)["version"] == 1


def test_request_on_a_stale_version_is_denied_against_that_version(direct_vm, deployed, direct_alice,
                                                                    direct_bob, mandate):
    update(deployed, direct_vm, direct_alice, mandate, 1, max_amount=900_000)
    r = request(deployed, direct_vm, direct_bob, mandate, version=1, amount=600_000)
    assert r["decision"] == "DENIED" and r["reason_code"] == "VERSION_MISMATCH"
    assert r["mandate_version"] == 1 and r["requested_version"] == 1
    receipt = deployed.get_decision_receipt(r["request_id"])
    assert receipt["mandate_terms"]["version"] == 1


def test_decisions_stay_bound_to_their_version(direct_vm, deployed, direct_alice, direct_bob, mandate):
    first = request(deployed, direct_vm, direct_bob, mandate, version=1)
    assert first["decision"] == "AUTHORIZED" and first["mandate_version"] == 1
    update(deployed, direct_vm, direct_alice, mandate, 1, target="Fixture Cloud GPUs")
    later = request(deployed, direct_vm, direct_bob, mandate, version=2, target="Fixture Cloud GPUs",
                    at=WITHIN + HOUR)
    assert later["decision"] == "AUTHORIZED" and later["mandate_version"] == 2
    old = deployed.get_decision_receipt(first["request_id"])
    assert old["request"]["mandate_version"] == 1
    assert old["mandate_terms"]["target"] == "Fixture Cloud compute"
    assert old["snapshot"]["mandate_version"] == 1


def test_a_new_version_starts_without_a_baseline(direct_vm, deployed, direct_alice, direct_bob, mandate):
    """A principal who reviews the changed reality re-issues the mandate; a
    violation on the new version is then a plain DENIED, not a material change
    relative to terms that no longer apply."""
    prohibited = {STATUS_URL: (200, STATUS_BODY), POLICY_URL: (200, POLICY_BODY_PROHIBITED)}
    request(deployed, direct_vm, direct_bob, mandate)
    assert deployed.get_mandate(mandate)["baseline_snapshot_id"] == 1
    update(deployed, direct_vm, direct_alice, mandate, 1)
    assert deployed.get_mandate(mandate)["baseline_snapshot_id"] == 0
    r = request(deployed, direct_vm, direct_bob, mandate, version=2, llm_json=USE_PROHIBITED,
                sources=prohibited)
    assert r["decision"] == "DENIED" and r["reason_code"] == "CONDITION_VIOLATED"
    assert r["material_change"] is False

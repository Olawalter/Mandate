"""Revocation is terminal."""
from .conftest import record_prompts, request, update


def test_revoked_mandate_cannot_authorize(direct_vm, deployed, direct_alice, direct_bob, mandate):
    direct_vm.sender = direct_alice
    deployed.revoke_mandate(mandate)
    prompts = record_prompts(direct_vm)
    r = request(deployed, direct_vm, direct_bob, mandate)
    assert r["decision"] == "DENIED" and r["reason_code"] == "MANDATE_REVOKED" and r["assessed"] is False
    assert prompts == []
    m = deployed.get_mandate(mandate)
    assert m["status"] == "REVOKED" and m["revoked_at"] > 0
    assert deployed.get_protocol_info()["active_count"] == 0


def test_revocation_is_terminal(direct_vm, deployed, direct_alice, mandate):
    direct_vm.sender = direct_alice
    deployed.revoke_mandate(mandate)
    with direct_vm.expect_revert("already revoked"):
        deployed.revoke_mandate(mandate)
    with direct_vm.expect_revert("is revoked"):
        update(deployed, direct_vm, direct_alice, mandate, 1)
    assert deployed.get_protocol_info()["active_count"] == 0


def test_revocation_keeps_history(direct_vm, deployed, direct_alice, direct_bob, mandate):
    before = request(deployed, direct_vm, direct_bob, mandate)
    direct_vm.sender = direct_alice
    deployed.revoke_mandate(mandate)
    assert deployed.get_decision_receipt(before["request_id"])["request"]["decision"] == "AUTHORIZED"
    assert deployed.list_mandate_requests(mandate)["total"] == 1

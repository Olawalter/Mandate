"""Deterministic preflight: a failed hard limit is DENIED without reading any
evidence, and the reason is the first failing check."""
import pytest

from .conftest import record_fetches, record_prompts, request


def _checks(r):
    return {c["check"]: c["passed"] for c in r["preflight"]}


@pytest.mark.parametrize("kwargs,reason,check", [
    ({"action": "SUBSCRIBE"}, "ACTION_NOT_PERMITTED", "action_permitted"),
    ({"target": "Other Cloud compute"}, "TARGET_NOT_PERMITTED", "target_permitted"),
    ({"currency": "EUR"}, "CURRENCY_MISMATCH", "currency_matches"),
    ({"amount": 500_001}, "AMOUNT_EXCEEDS_LIMIT", "amount_within_limit"),
    ({"amount": 0}, "AMOUNT_EXCEEDS_LIMIT", "amount_within_limit"),
    ({"amount": -5}, "AMOUNT_EXCEEDS_LIMIT", "amount_within_limit"),
    ({"version": 2}, "VERSION_MISMATCH", "version_current"),
    ({"version": 0}, "VERSION_MISMATCH", "version_current"),
])
def test_hard_limit_failure_is_denied_without_evidence(direct_vm, deployed, direct_bob, mandate,
                                                       kwargs, reason, check):
    prompts = record_prompts(direct_vm)
    fetches = record_fetches(direct_vm)
    r = request(deployed, direct_vm, direct_bob, mandate, **kwargs)
    assert r["decision"] == "DENIED" and r["reason_code"] == reason
    assert _checks(r)[check] is False
    assert r["assessed"] is False and r["snapshot_id"] == 0
    assert prompts == [] and fetches == []
    assert deployed.get_protocol_info()["snapshot_count"] == 0


def test_amount_exactly_at_limit_passes(direct_vm, deployed, direct_bob, mandate):
    r = request(deployed, direct_vm, direct_bob, mandate, amount=500_000)
    assert r["decision"] == "AUTHORIZED" and all(_checks(r).values())


def test_target_comparison_ignores_case_and_spacing_only(direct_vm, deployed, direct_bob, mandate):
    assert request(deployed, direct_vm, direct_bob, mandate, target="  fixture   CLOUD compute ")["decision"] == "AUTHORIZED"
    assert request(deployed, direct_vm, direct_bob, mandate, target="Fixture Cloud computer")["reason_code"] == "TARGET_NOT_PERMITTED"


def test_first_failing_check_is_the_reason_and_all_are_recorded(direct_vm, deployed, direct_bob, mandate):
    r = request(deployed, direct_vm, direct_bob, mandate, action="PAY", amount=9_000_000, currency="EUR")
    assert r["reason_code"] == "ACTION_NOT_PERMITTED"
    c = _checks(r)
    assert (c["action_permitted"], c["currency_matches"], c["amount_within_limit"]) == (False, False, False)
    assert [x["check"] for x in r["preflight"]] == [
        "agent_matches_mandate", "mandate_active", "mandate_not_expired", "version_current",
        "action_permitted", "target_permitted", "currency_matches", "amount_within_limit"]


def test_denied_constraint_is_counted(direct_vm, deployed, direct_bob, mandate):
    request(deployed, direct_vm, direct_bob, mandate, amount=10**9)
    m = deployed.get_mandate(mandate)
    assert (m["request_count"], m["denied_count"], m["authorized_count"]) == (1, 1, 0)
    assert deployed.get_protocol_info()["denied_total"] == 1


def test_malformed_request_fields_are_refused(direct_vm, deployed, direct_bob, mandate):
    for key in ("", "has space", "x" * 65, "semi;colon"):
        with direct_vm.expect_revert("request_key must be"):
            request(deployed, direct_vm, direct_bob, mandate, key=key)
    with direct_vm.expect_revert("target is required"):
        request(deployed, direct_vm, direct_bob, mandate, target="  ")
    assert deployed.get_protocol_info()["request_count"] == 0

"""Expiry is enforced against the transaction time."""
from .conftest import DAY, EXPIRES, T0, record_prompts, request, update


def test_request_one_second_before_expiry_is_assessed(direct_vm, deployed, direct_bob, mandate):
    assert request(deployed, direct_vm, direct_bob, mandate, at=EXPIRES - 1)["decision"] == "AUTHORIZED"


def test_request_at_and_after_expiry_is_denied(direct_vm, deployed, direct_bob, mandate):
    prompts = record_prompts(direct_vm)
    for at in (EXPIRES, EXPIRES + DAY):
        r = request(deployed, direct_vm, direct_bob, mandate, at=at)
        assert r["decision"] == "DENIED" and r["reason_code"] == "MANDATE_EXPIRED"
        assert r["assessed"] is False
    assert prompts == []


def test_expired_mandate_can_be_reissued_with_a_new_expiry(direct_vm, deployed, direct_alice, direct_bob,
                                                            mandate):
    from .conftest import warp_to
    warp_to(direct_vm, EXPIRES + DAY)
    update(deployed, direct_vm, direct_alice, mandate, 1, expires_at=EXPIRES + 10 * DAY)
    r = request(deployed, direct_vm, direct_bob, mandate, version=2, at=EXPIRES + DAY + 60)
    assert r["decision"] == "AUTHORIZED"


def test_expiry_reason_wins_over_later_checks(direct_vm, deployed, direct_bob, mandate):
    r = request(deployed, direct_vm, direct_bob, mandate, at=EXPIRES, amount=10**9)
    assert r["reason_code"] == "MANDATE_EXPIRED"


def test_submitted_at_is_the_transaction_time(direct_vm, deployed, direct_bob, mandate):
    assert request(deployed, direct_vm, direct_bob, mandate, at=T0 + 777)["submitted_at"] == T0 + 777

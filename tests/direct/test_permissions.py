"""Access control: every permission check is the contract's."""
from .conftest import T0, create, hex_of, request, update, warp_to


def test_only_the_principal_can_update(direct_vm, deployed, direct_alice, direct_bob, direct_charlie, mandate):
    for stranger in (direct_bob, direct_charlie):
        with direct_vm.expect_revert("only the principal can update"):
            update(deployed, direct_vm, stranger, mandate, 1, max_amount=9_999_999)
    m = deployed.get_mandate(mandate)
    assert m["version"] == 1 and m["terms"]["max_amount"] == 500_000


def test_only_the_principal_can_revoke(direct_vm, deployed, direct_alice, direct_bob, direct_charlie, mandate):
    for stranger in (direct_bob, direct_charlie):
        direct_vm.sender = stranger
        with direct_vm.expect_revert("only the principal can revoke"):
            deployed.revoke_mandate(mandate)
    assert deployed.get_mandate(mandate)["status"] == "ACTIVE"


def test_only_the_agent_can_request(direct_vm, deployed, direct_alice, direct_bob, direct_charlie, mandate):
    """Not a stranger, and not the principal either: the mandate names one agent."""
    for stranger in (direct_charlie, direct_alice):
        with direct_vm.expect_revert("only the mandate's agent can request"):
            request(deployed, direct_vm, stranger, mandate)
    assert deployed.get_protocol_info()["request_count"] == 0
    assert deployed.get_mandate(mandate)["request_count"] == 0


def test_a_principal_acting_as_their_own_agent_is_explicit(direct_vm, deployed, direct_alice):
    mid = create(deployed, direct_vm, direct_alice, direct_alice)
    r = request(deployed, direct_vm, direct_alice, mid)
    assert r["decision"] == "AUTHORIZED"
    assert r["principal"] == r["agent"]


def test_unknown_mandate_is_refused(direct_vm, deployed, direct_bob):
    with direct_vm.expect_revert("mandate 7 does not exist"):
        request(deployed, direct_vm, direct_bob, "7")


def test_recorded_accounts_are_signers(direct_vm, deployed, direct_alice, direct_bob, mandate):
    """Principal is the create signer and agent the request signer — neither is
    taken from a caller-supplied field."""
    r = request(deployed, direct_vm, direct_bob, mandate)
    assert r["principal"].lower() == hex_of(direct_alice)
    assert r["agent"].lower() == hex_of(direct_bob)


def test_no_owner_or_admin_surface(deployed):
    info = deployed.get_protocol_info()
    assert not any(k in info for k in ("owner", "admin"))

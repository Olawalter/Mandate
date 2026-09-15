"""Real authorization against real evidence, plus the hard limits and access
control, all through StudioNet consensus."""


def test_real_evidence_decision_follows_reality(world):
    r = world.real()
    assert r["entry"]["execution"] == "SUCCESS" and r["entry"]["consensus"] in ("MAJORITY_AGREE", "AGREE")
    req, snap = r["request"], r["snapshot"]
    assert req["assessed"] is True and req["mandate_version"] == 1 and req["snapshot_id"] == snap["snapshot_id"]
    assert snap["source_count"] == 2 and snap["mandate_id"] == req["mandate_id"]
    before, after = r["codespaces_operational_before_and_after"]
    if before and after:
        assert req["decision"] == "AUTHORIZED", req
        assert snap["service_available"] is True
        quote = snap["conditions"][0]["quote"]
        assert quote and snap["conditions"][0]["source"] in ("S1", "S2")
    elif not before and not after:
        assert req["decision"] != "AUTHORIZED", req


def test_agent_identity_is_enforced(world):
    c = world.constraints()
    for key in ("stranger", "principal_not_agent"):
        assert c[key]["entry"]["refused"] and "only the mandate's agent" in c[key]["entry"]["refusal"]


def test_hard_limits_deny_without_evidence(world):
    c = world.constraints()
    for key, reason in (("over_limit", "AMOUNT_EXCEEDS_LIMIT"), ("wrong_target", "TARGET_NOT_PERMITTED"),
                        ("wrong_action", "ACTION_NOT_PERMITTED")):
        req = c[key]["request"]
        assert (req["decision"], req["reason_code"], req["assessed"], req["snapshot_id"]) == \
            ("DENIED", reason, False, 0), key


def test_replay_is_refused(world):
    c = world.constraints()
    assert c["replay"]["entry"]["refused"] and "was already used" in c["replay"]["entry"]["refusal"]


def test_only_the_principal_updates_and_revokes(world):
    c = world.constraints()
    assert c["stranger_update"]["refused"] and "only the principal can update" in c["stranger_update"]["refusal"]
    assert c["stranger_revoke"]["refused"] and "only the principal can revoke" in c["stranger_revoke"]["refusal"]


def test_versioning_and_revocation(world):
    c = world.constraints()
    assert c["version_after_update"] == 2 and c["version_1_terms"]["max_amount"] == 500_000
    stale = c["stale_version"]["request"]
    assert (stale["decision"], stale["reason_code"], stale["mandate_version"]) == ("DENIED", "VERSION_MISMATCH", 1)
    revoked = c["revoked"]["request"]
    assert (revoked["decision"], revoked["reason_code"]) == ("DENIED", "MANDATE_REVOKED")

"""Material change: authorization that expires when reality changes.

Relevance is semantic — the question is whether a condition that justified an
earlier authorization still holds, not whether page bytes changed."""
import copy

from .conftest import (ALL_SATISFIED, POLICY_BODY, POLICY_BODY_BILLING_CHANGED, POLICY_BODY_PROHIBITED,
                       POLICY_URL, Q_AVAILABLE, Q_ELIGIBLE, Q_TERMS, Q_USE, STATUS_BODY, STATUS_URL,
                       USE_PROHIBITED, WITHIN, HOUR, answer, cond, mock_round, request, round_index, update)

PROHIBITED = {STATUS_URL: (200, STATUS_BODY), POLICY_URL: (200, POLICY_BODY_PROHIBITED)}
BILLING_CHANGED = {STATUS_URL: (200, STATUS_BODY), POLICY_URL: (200, POLICY_BODY_BILLING_CHANGED)}


def test_policy_change_after_authorization_forces_reassessment(direct_vm, deployed, direct_bob, mandate):
    first = request(deployed, direct_vm, direct_bob, mandate)
    assert first["decision"] == "AUTHORIZED"

    later = request(deployed, direct_vm, direct_bob, mandate, at=WITHIN + HOUR,
                    llm_json=USE_PROHIBITED, sources=PROHIBITED)
    assert later["decision"] == "REASSESS_REQUIRED" and later["reason_code"] == "MATERIAL_CHANGE"
    assert later["material_change"] is True and later["affected_conditions"] == ["intended_use_permitted"]
    s = deployed.get_evidence_snapshot(str(later["snapshot_id"]))
    assert s["baseline_snapshot_id"] == first["snapshot_id"]
    assert (s["provider_eligible"], s["service_available"], s["terms_compatible"],
            s["intended_use_permitted"], s["material_change"]) == (True, True, True, False, True)
    # the baseline is the authorization, not the reassessment
    assert deployed.get_mandate(mandate)["baseline_snapshot_id"] == first["snapshot_id"]


def test_irrelevant_page_change_is_not_a_material_change(direct_vm, deployed, direct_bob, mandate):
    """Negative control: the billing sentence changed, the condition did not."""
    request(deployed, direct_vm, direct_bob, mandate)
    r = request(deployed, direct_vm, direct_bob, mandate, at=WITHIN + HOUR, sources=BILLING_CHANGED)
    assert r["decision"] == "AUTHORIZED" and r["material_change"] is False
    assert POLICY_BODY_BILLING_CHANGED != POLICY_BODY


def test_reassessment_persists_until_reality_or_the_principal_changes(direct_vm, deployed, direct_alice,
                                                                      direct_bob, mandate):
    request(deployed, direct_vm, direct_bob, mandate)
    for k in range(3):
        r = request(deployed, direct_vm, direct_bob, mandate, at=WITHIN + (k + 1) * HOUR,
                    llm_json=USE_PROHIBITED, sources=PROHIBITED)
        assert r["decision"] == "REASSESS_REQUIRED"
    # reality reverts: a fresh assessment authorizes again
    assert request(deployed, direct_vm, direct_bob, mandate, at=WITHIN + 5 * HOUR)["decision"] == "AUTHORIZED"
    m = deployed.get_mandate(mandate)
    assert (m["authorized_count"], m["reassess_count"]) == (2, 3)


def test_unavailable_evidence_after_authorization_is_reassess_not_material(direct_vm, deployed, direct_bob,
                                                                          mandate):
    request(deployed, direct_vm, direct_bob, mandate)
    r = request(deployed, direct_vm, direct_bob, mandate, at=WITHIN + HOUR,
                sources={STATUS_URL: (200, STATUS_BODY), POLICY_URL: (503, b"")},
                llm_json=answer(cond("provider_eligible", "SATISFIED", "S1", Q_ELIGIBLE),
                                cond("service_available", "SATISFIED", "S1", Q_AVAILABLE),
                                cond("terms_compatible", "UNVERIFIED"),
                                cond("intended_use_permitted", "UNVERIFIED")))
    assert r["decision"] == "REASSESS_REQUIRED" and r["reason_code"] == "EVIDENCE_INCONCLUSIVE"
    assert r["material_change"] is False and r["affected_conditions"] == []


def test_several_conditions_changing_are_all_named(direct_vm, deployed, direct_bob, mandate):
    request(deployed, direct_vm, direct_bob, mandate)
    both = answer(cond("provider_eligible", "SATISFIED", "S1", Q_ELIGIBLE),
                  cond("service_available", "SATISFIED", "S1", Q_AVAILABLE),
                  cond("terms_compatible", "VIOLATED", "S2", "AI inference workloads are prohibited on all compute plans."),
                  cond("intended_use_permitted", "VIOLATED", "S2", "AI inference workloads are prohibited on all compute plans."))
    r = request(deployed, direct_vm, direct_bob, mandate, at=WITHIN + HOUR, llm_json=both, sources=PROHIBITED)
    assert r["affected_conditions"] == ["terms_compatible", "intended_use_permitted"]
    s = deployed.get_evidence_snapshot(str(r["snapshot_id"]))
    assert (s["terms_compatible"], s["intended_use_permitted"]) == (False, False)


def test_a_hard_limit_failure_after_authorization_is_denied_not_reassessed(direct_vm, deployed, direct_bob,
                                                                          mandate):
    request(deployed, direct_vm, direct_bob, mandate)
    r = request(deployed, direct_vm, direct_bob, mandate, at=WITHIN + HOUR, amount=10**9,
                llm_json=USE_PROHIBITED, sources=PROHIBITED)
    assert r["decision"] == "DENIED" and r["reason_code"] == "AMOUNT_EXCEEDS_LIMIT"


def test_validator_must_agree_on_the_material_change(direct_vm, deployed, direct_bob, mandate):
    request(deployed, direct_vm, direct_bob, mandate)
    request(deployed, direct_vm, direct_bob, mandate, at=WITHIN + HOUR, llm_json=USE_PROHIBITED, sources=PROHIBITED)
    i = round_index(direct_vm)
    honest = direct_vm._captured_validators[i][0]
    assert honest["material_change"] is True
    mock_round(direct_vm, USE_PROHIBITED, PROHIBITED)
    assert direct_vm.run_validator(index=i, leader_result=copy.deepcopy(honest)) is True, "control"
    hidden = copy.deepcopy(honest)
    hidden.update(decision="AUTHORIZED", reason_code="CONDITIONS_SATISFIED", material_change=False,
                  affected_conditions=[])
    hidden["conditions"][3] = {"key": "intended_use_permitted", "finding": "SATISFIED", "source": "S2",
                               "quote": "AI inference workloads are prohibited on all compute plans."}
    assert direct_vm.run_validator(index=i, leader_result=hidden) is False
    # a validator whose own fetch still shows the old page disagrees with the reassessment
    mock_round(direct_vm, ALL_SATISFIED)
    assert direct_vm.run_validator(index=i, leader_result=copy.deepcopy(honest)) is False


def test_decision_counters_add_up(direct_vm, deployed, direct_bob, mandate):
    request(deployed, direct_vm, direct_bob, mandate)
    request(deployed, direct_vm, direct_bob, mandate, at=WITHIN + HOUR, llm_json=USE_PROHIBITED, sources=PROHIBITED)
    request(deployed, direct_vm, direct_bob, mandate, at=WITHIN + HOUR, amount=10**9)
    info = deployed.get_protocol_info()
    assert (info["authorized_total"], info["reassess_total"], info["denied_total"], info["request_count"],
            info["snapshot_count"]) == (1, 1, 1, 3, 2)

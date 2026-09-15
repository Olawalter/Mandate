"""Authorization that expires when reality changes — live.

The evidence page is a labelled demonstration fixture edited with real git
commits; validators fetch it for themselves."""


def test_baseline_authorization(world):
    m = world.material()
    req = m["baseline"]["request"]
    assert req["decision"] == "AUTHORIZED", req
    assert m["baseline"]["snapshot"]["intended_use_permitted"] is True


def test_irrelevant_change_is_not_material(world):
    """Negative control: only the billing sentence changed."""
    m = world.material()
    req = m["irrelevant"]["request"]
    assert req["decision"] == "AUTHORIZED" and req["material_change"] is False, req


def test_relevant_change_forces_reassessment(world):
    m = world.material()
    req, snap = m["material"]["request"], m["material"]["snapshot"]
    assert req["decision"] == "REASSESS_REQUIRED" and req["reason_code"] == "MATERIAL_CHANGE", req
    assert req["material_change"] is True and "intended_use_permitted" in req["affected_conditions"]
    assert snap["intended_use_permitted"] is False
    assert snap["baseline_snapshot_id"] == m["irrelevant"]["snapshot"]["snapshot_id"]


def test_fresh_assessment_after_reality_reverts(world):
    m = world.material()
    assert m["fresh"]["request"]["decision"] == "AUTHORIZED"

"""A decision becomes durable only at protocol finality."""


def test_decision_reaches_finality_and_reads_back_from_final_state(world):
    f = world.finalized()
    assert f["facts"]["status"] == "FINALIZED"
    receipt = f["receipt"]
    real = world.real()["request"]
    assert receipt["request"]["request_id"] == real["request_id"]
    assert receipt["request"]["decision"] == real["decision"]
    assert receipt["mandate_terms"]["version"] == real["mandate_version"]
    assert receipt["snapshot"]["snapshot_id"] == real["snapshot_id"]

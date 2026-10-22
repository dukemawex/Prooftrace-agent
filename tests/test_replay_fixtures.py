"""Prevent a recording fixture from inventing evidence or losing simulation labels."""
import hashlib
import json
from pathlib import Path

import pytest

from backend.evidence import Narrative, validate_citations

REPLAYS = json.loads((Path(__file__).resolve().parents[1] / "frontend/lib/replay-fixtures.json").read_text())


@pytest.mark.parametrize("txn_id", ["TXN-9001", "TXN-9002", "TXN-9003"])
def test_replay_evidence_matches_offline_sql(txn_id, database):
    run = REPLAYS[txn_id]
    assert run["simulation"] == {
        "enabled": True, "label": "Simulated replay · fictional fixtures",
        "model_calls_made": False, "memory_persisted": False,
    }
    assert run["data_source"] == "demo-replay"
    assert run["memory_episodes_used"] == 0
    assert not run["model_routes"]
    assert all(row["is_demo"] == 1 for row in run["evidence"].values())
    assert all(model.startswith("nvidia/") for model in run["models"].values())
    assert run["verdict"] == ("CLEARED" if txn_id == "TXN-9001" else "ESCALATED")
    assert run["guard"]["injection_detected"] == (txn_id == "TXN-9003")
    validate_citations(Narrative(verdict=run["verdict"], claims=run["claims"]), run["evidence"])
    digest = hashlib.sha256(json.dumps(run["evidence"], sort_keys=True).encode()).hexdigest()
    assert digest == run["evidence_digest"]
    for event in run["trace"]:
        if "provider" in event:
            assert event["provider"] == "demo-replay"
        if event["type"] != "query":
            continue
        assert event["source"] == "demo-replay"
        assert event["executed_sql"].lstrip().upper().startswith("SELECT")
        rows = database.query(event["executed_sql"])
        for row in rows:
            if "fetched_at" in row:
                row["fetched_at"] = "2026-10-22T09:00:00+00:00"
        assert rows == event["rows"], event["tool"]

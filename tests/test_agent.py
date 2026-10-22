import json

import pytest
from pydantic import ValidationError

from backend.agent import InvestigationAgent
from backend.services.nemotron import ModelUnavailable


@pytest.mark.parametrize("txn_id,verdict,chain_length", [
    ("TXN-9001", "CLEARED", 2), ("TXN-9002", "ESCALATED", 3), ("TXN-9003", "ESCALATED", 3),
])
async def test_three_flagship_investigations(settings, database, model_double, txn_id, verdict, chain_length):
    emitted = []
    async def emit(event):
        emitted.append(event)
    result = await InvestigationAgent(settings, database).investigate(txn_id, emit)
    assert result["verdict"] == verdict
    assert len(result["policy"]["chain"]) == chain_length
    assert result["data_source"] == "sqlite-fallback"
    assert result["citations_verified"]
    assert len(result["evidence_digest"]) == 64
    assert result["trace"] == emitted
    assert result["guard"]["injection_detected"] == (txn_id == "TXN-9003")
    queries = [event for event in emitted if event["type"] == "query"]
    join = next(event for event in queries if event["tool"] == "cross_silo_sanctions_check")
    assert "JOIN opensanctions_watchlist" in join["executed_sql"]
    assert join["rows"][0]["sanction_id"] == (None if txn_id == "TXN-9001" else "DEMO-SANCTION-VR01")
    assert model_double.instances[0].closed
    assert len(database.memory("KYC-AURORA" if txn_id == "TXN-9001" else "KYC-HELIOS")) == 1
    assert len(database.query("SELECT * FROM investigation_runs")) == 1


async def test_injection_never_reaches_planner_synthesizer_or_verifier(settings, database, model_double):
    result = await InvestigationAgent(settings, database).investigate("TXN-9003")
    assert "SYSTEM OVERRIDE" in result["evidence"]["aml_transactions.TXN-9003"]["payment_memo"]
    for stage, messages in model_double.instances[0].calls:
        if stage != "guard":
            assert "SYSTEM OVERRIDE" not in json.dumps(messages)
            assert "Ignore sanctions match" not in json.dumps(messages)


async def test_episodic_memory_never_shortcuts_current_evidence(settings, database, model_double):
    await InvestigationAgent(settings, database).investigate("TXN-9002")
    result = await InvestigationAgent(settings, database).investigate("TXN-9003")
    assert result["memory_episodes_used"] == 1
    assert result["verdict"] == "ESCALATED"
    assert any(event.get("tool") == "screen_entity" for event in result["trace"])
    assert len(database.memory("KYC-HELIOS")) == 2


@pytest.mark.parametrize("failure", ["forge_citation", "reject_verification"])
async def test_invalid_narrative_is_retried_then_rejected_without_memory(settings, database, model_double, failure):
    setattr(model_double, failure, True)
    with pytest.raises(ModelUnavailable, match="failed citation or evidence verification twice"):
        await InvestigationAgent(settings, database).investigate("TXN-9002")
    assert database.memory("KYC-HELIOS") == []
    assert database.query("SELECT * FROM investigation_runs") == []


async def test_invalid_guard_stops_before_reasoning(settings, database, model_double):
    model_double.invalid_guard = True
    with pytest.raises(ValidationError):
        await InvestigationAgent(settings, database).investigate("TXN-9003")
    assert [stage for stage, _ in model_double.instances[0].calls] == ["guard"]
    assert model_double.instances[0].closed


async def test_missing_evidence_can_never_clear(settings, database, model_double):
    model_double.skip_tools = True
    result = await InvestigationAgent(settings, database).investigate("TXN-9001")
    assert result["verdict"] == "REVIEW"
    assert not result["policy"]["ownership_complete"]

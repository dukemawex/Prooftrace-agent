import csv
import io
import json
from dataclasses import replace

import httpx
import pytest
from openai import AsyncOpenAI

from backend.config import MODELS
from backend.evidence import Claim, Fact, Narrative, validate_citations
from backend.services.database import Database
from backend.services.nemotron import Nemotron
from scripts.seed_open_data import fetch_opensanctions, seed


def test_seeder_idempotence_and_honest_provenance(settings, database):
    summary = seed(settings, offline=True)
    assert summary["live_rows_imported"] == 0
    assert len(database.query("SELECT * FROM aml_transactions")) == 3
    assert len(database.query("SELECT * FROM icij_kyc_entities")) == 5
    sanctions = database.query("SELECT * FROM opensanctions_watchlist")
    assert len(sanctions) == 1
    assert sanctions[0]["is_demo"] == 1
    assert sanctions[0]["source_url"].startswith("urn:prooftrace:fictional")


def test_streaming_csv_preserves_quoted_fields_and_stops_at_300(monkeypatch):
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["id", "name", "schema", "dataset"])
    writer.writeheader()
    for i in range(305):
        writer.writerow({"id": f"test-{i}", "name": f'Test, "Name" {i}', "schema": "Person", "dataset": "test-only"})
    real_client = httpx.Client
    monkeypatch.setattr("scripts.seed_open_data.httpx.Client", lambda **kwargs: real_client(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, text=output.getvalue())), **kwargs))
    rows = fetch_opensanctions(300)
    assert len(rows) == 300
    assert rows[0]["name"] == 'Test, "Name" 0'
    assert all(row["is_demo"] == 0 for row in rows)


def test_live_download_error_never_silently_seeds_fake_live_data(settings, monkeypatch):
    def failure(count):
        raise RuntimeError("Dataset unreachable")
    monkeypatch.setattr("scripts.seed_open_data.fetch_opensanctions", failure)
    with pytest.raises(RuntimeError):
        seed(settings)
    assert not Database(settings).path.exists()


@pytest.mark.parametrize("bad_fact", [
    Fact(citation="aml_transactions.missing", field="amount_cents", value=100),
    Fact(citation="aml_transactions.TXN-1", field="amount_cents", value=999),
    Fact(citation="aml_transactions.TXN-1", field="payment_memo", value="untrusted"),
])
def test_fabricated_and_quarantined_citations_are_rejected(bad_fact):
    claim = Claim(text=f"A claim [CITE: {bad_fact.citation}]", facts=[bad_fact])
    narrative = Narrative(verdict="REVIEW", claims=[claim, claim])
    with pytest.raises(ValueError):
        validate_citations(narrative, {"aml_transactions.TXN-1": {"amount_cents": 100, "payment_memo": "untrusted"}})


async def test_application_adapter_only_routes_to_the_three_requested_nvidia_models(settings):
    requests = []
    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={"id": "test", "object": "chat.completion", "created": 1,
            "model": requests[-1]["model"], "choices": [{"index": 0, "finish_reason": "stop",
            "message": {"role": "assistant", "content": "{}"}}]})
    model = Nemotron(settings)
    await model.client.close()
    model.client = AsyncOpenAI(api_key="test-key", base_url="https://test.invalid/v1",
                              http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    try:
        for stage in MODELS:
            await model.complete(stage, [{"role": "user", "content": "test"}])
        with pytest.raises(ValueError):
            await model.complete("other_provider", [])
    finally:
        await model.close()
    assert [request["model"] for request in requests] == list(MODELS.values())
    assert all(request["model"].startswith("nvidia/") for request in requests)

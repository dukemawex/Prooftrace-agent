from dataclasses import replace

import httpx
import pytest

from backend.services.zetaris import DataUnavailable, Zetaris


async def test_remote_queries_and_response_mapping(settings, database):
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"columns": [{"name": "record_id"}], "data": [["TXN-9001"]]})
    config = replace(settings, zetaris_api_url="https://zetaris.example/query", zetaris_api_key="test-key",
                     zetaris_tables={"aml_transactions": "bank.aml_transactions", "icij_kyc_entities": "kyc.entities", "opensanctions_watchlist": "risk.watchlist"})
    service = Zetaris(config, database, httpx.MockTransport(handler))
    result = await service.transaction("TXN-9001")
    assert result.source == "zetaris"
    assert result.rows == [{"record_id": "TXN-9001"}]
    assert "FROM bank.aml_transactions" in result.executed_sql
    assert b'"select"' in requests[0].content
    assert requests[0].headers["Authorization"] == "Bearer test-key"


async def test_offline_fallback_is_pinned_and_labelled(settings, database):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(503)
    config = replace(settings, zetaris_api_url="https://zetaris.example/query", zetaris_api_key="test-key")
    service = Zetaris(config, database, httpx.MockTransport(handler))
    first = await service.transaction("TXN-9002")
    second = await service.execute_tool("lookup_entity", {"entity_id": "KYC-HELIOS"}, "TXN-9002")
    assert first.source == second.source == "sqlite-fallback"
    assert first.fallback_reason
    assert len(calls) == 1


async def test_mid_investigation_outage_never_mixes_sources(settings, database):
    codes = iter([200, 503])
    config = replace(settings, zetaris_api_url="https://zetaris.example/query", zetaris_api_key="test-key")
    service = Zetaris(config, database, httpx.MockTransport(lambda request: httpx.Response(next(codes), json={"rows": []})))
    await service.transaction("TXN-9002")
    with pytest.raises(DataUnavailable, match="without changing evidence source"):
        await service.transaction("TXN-9002")


@pytest.mark.parametrize("status", [401, 403, 400])
async def test_authorization_and_schema_failures_are_not_hidden(settings, database, status):
    config = replace(settings, zetaris_api_url="https://zetaris.example/query", zetaris_api_key="test-key")
    with pytest.raises(DataUnavailable):
        await Zetaris(config, database, httpx.MockTransport(lambda request: httpx.Response(status))).transaction("TXN-9002")


async def test_no_fallback_when_disabled(settings, database):
    with pytest.raises(DataUnavailable, match="fallback is disabled"):
        await Zetaris(replace(settings, allow_local_fallback=False), database).transaction("TXN-9001")


async def test_read_only_tools_escape_identifiers_and_reject_arbitrary_sql(settings, database):
    service = Zetaris(settings, database)
    result = await service.execute_tool("lookup_entity", {"entity_id": "'; DROP TABLE aml_transactions; --"}, "TXN-9001")
    assert result.rows == []
    assert len(database.query("SELECT * FROM aml_transactions")) == 3
    with pytest.raises(ValueError):
        await service.execute_tool("execute_sql", {"sql": "DELETE FROM aml_transactions"}, "TXN-9001")


@pytest.mark.parametrize("payload", [{"message": "ok"}, {"rows": [{}] * 100}, {"rows": [], "hasMore": True}, {"error": "bad SQL"}])
def test_incomplete_and_invalid_result_envelopes_rejected(payload):
    with pytest.raises(DataUnavailable):
        Zetaris.parse_rows(payload)


def test_native_records_envelope_preserves_source_values():
    records = [{"record_id": "KYC-HELIOS", "ownership_percent": "51", "is_demo": "1"}]
    assert Zetaris.parse_rows({"records": records, "queryToken": "test-token"}) == records

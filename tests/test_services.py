"""Opt-in integration checks used by Actions after seeding SQL and MongoDB."""
import os

import pytest
from fastapi.testclient import TestClient

from backend.config import Settings
from backend.main import create_app
from backend.services.database import Database
from backend.services.zetaris import Zetaris

pytestmark = [pytest.mark.services, pytest.mark.skipif(os.getenv("RUN_SERVICE_TESTS") != "1", reason="Opt-in seeded service checks")]


async def test_seeded_services_and_federated_fallback():
    from dataclasses import replace
    settings = Settings()
    database = Database(settings)
    assert database.metadata()["live_rows_stored"] >= 300
    local = replace(settings, zetaris_api_url="", zetaris_api_key="", allow_local_fallback=True)
    result = await Zetaris(local, database).execute_tool("cross_silo_sanctions_check", {}, "TXN-9002")
    assert result.rows[0]["sanction_id"] == "DEMO-SANCTION-VR01"
    assert result.rows[0]["first_hop_percent"] == 51
    assert result.rows[0]["second_hop_percent"] == 100
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/health").status_code == 200
        response = client.get("/api/alerts", headers={"X-ProofTrace-Key": settings.api_key})
        assert len(response.json()["alerts"]) == 3
    if settings.mongodb_uri:
        from pymongo import MongoClient
        with MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=10_000) as mongo:
            assert mongo[settings.mongodb_database].icij_kyc_entities.find_one({"record_id": "KYC-HELIOS"})["owner_id"] == "KYC-ALBA"

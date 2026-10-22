import json
from dataclasses import replace

from fastapi.testclient import TestClient

from backend.main import create_app


def test_health_alerts_missing_key_and_auth(settings, database):
    with TestClient(create_app(replace(settings, meterless_api_key="", api_key="shared-test-key"))) as client:
        health = client.get("/api/health").json()
        assert health["status"] == "setup_required"
        assert health["meterless"]["connectivity"] == "not_probed"
        assert client.get("/api/alerts").status_code == 401
        headers = {"X-ProofTrace-Key": "shared-test-key"}
        response = client.get("/api/alerts", headers=headers)
        assert len(response.json()["alerts"]) == 3
        assert client.post("/api/investigate/TXN-9001", headers=headers).status_code == 503


def test_sse_stream_and_memory_update(settings, database, model_double):
    with TestClient(create_app(settings)) as client:
        with client.stream("POST", "/api/investigate/TXN-9003?stream=true") as response:
            assert response.status_code == 200
            events = [json.loads(line[6:]) for line in response.iter_lines() if line.startswith("data: ")]
        assert events[-1]["type"] == "result"
        assert events[-1]["result"]["verdict"] == "ESCALATED"
        assert events[-1]["result"]["guard"]["injection_detected"]
        assert any(event["type"] == "query" for event in events[:-1])
        queue = client.get("/api/alerts").json()["alerts"]
        assert queue[2]["memory_episodes"] == 1
        assert queue[2]["last_verdict"] == "ESCALATED"
        assert client.post("/api/investigate/UNKNOWN").status_code == 404


def test_json_endpoint_and_failed_stream_release_lock(settings, database, model_double):
    with TestClient(create_app(settings)) as client:
        model_double.reject_verification = True
        response = client.post("/api/investigate/TXN-9001?stream=true")
        assert '"type": "error"' in response.text
        assert '"type": "result"' not in response.text
        model_double.reject_verification = False
        response = client.post("/api/investigate/TXN-9001")
        assert response.status_code == 200
        assert response.json()["verdict"] == "CLEARED"

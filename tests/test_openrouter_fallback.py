import json
from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient
from openai import AsyncOpenAI

from backend.agent import GUARD_PROMPT, PLANNER_PROMPT
from backend.config import MODELS, OPENROUTER_MODEL
from backend.main import create_app
from backend.services.nemotron import ModelUnavailable, Nemotron
from tests.conftest import ScriptedNemotron


def completion(model, content="{}", finish_reason="stop"):
    return {"id": "test-completion", "object": "chat.completion", "created": 1,
            "model": model, "choices": [{"index": 0, "finish_reason": finish_reason,
                                         "message": {"role": "assistant", "content": content}}]}


def install_transport(monkeypatch, handler):
    def client_factory(**kwargs):
        return AsyncOpenAI(**kwargs, http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr("backend.services.nemotron.AsyncOpenAI", client_factory)


@pytest.mark.parametrize("failure", ["network", 401, 402, 403, 404, 408, 429, 503])
async def test_primary_failure_uses_only_free_nvidia_and_pins_stage(settings, monkeypatch, failure):
    requests = []
    def handler(request):
        body = json.loads(request.content)
        requests.append((request, body))
        if request.url.host != "openrouter.ai":
            if failure == "network":
                raise httpx.ConnectError("test failure", request=request)
            return httpx.Response(failure, json={"error": {"message": "sensitive-upstream-body", "type": "provider_error"}})
        return httpx.Response(200, json=completion(body["model"]))

    install_transport(monkeypatch, handler)
    model = Nemotron(replace(settings, openrouter_api_key="test-openrouter-key"))
    events = []
    async def emit(event):
        events.append(event)
    model.on_route = emit
    try:
        await model.complete("planner", [{"role": "user", "content": "test"}], tools=[{"type": "function", "function": {"name": "read_data", "parameters": {"type": "object"}}}])
        await model.complete("planner", [{"role": "user", "content": "next tool round"}])
        assert model.route_for("planner")["provider"] == "openrouter"
        assert model.route_for("guard")["provider"] == "meterless"
    finally:
        await model.close()
    assert len(requests) == 3
    assert requests[0][1]["model"] == MODELS["planner"]
    for request, body in requests[1:]:
        assert body["model"] == OPENROUTER_MODEL
        assert body["provider"] == {"require_parameters": True, "max_price": {"prompt": 0, "completion": 0}}
        assert body["reasoning"] == {"enabled": False}
        assert "models" not in body
        assert request.headers["authorization"] == "Bearer test-openrouter-key"
    assert requests[0][0].headers["authorization"] == "Bearer test-key-not-a-real-credential"
    assert requests[1][1]["tools"][0]["function"]["name"] == "read_data"
    assert [(event["provider"], event["status"]) for event in events[:4]] == [
        ("meterless", "running"), ("meterless", "failed"), ("openrouter", "running"), ("openrouter", "completed")]
    assert "sensitive-upstream-body" not in json.dumps(events)
    assert model.client.is_closed() and model.fallback_client.is_closed()


async def test_primary_success_does_not_use_fallback(settings, monkeypatch):
    models = []
    def handler(request):
        models.append(json.loads(request.content)["model"])
        assert request.url.host != "openrouter.ai"
        return httpx.Response(200, json=completion(models[-1]))
    install_transport(monkeypatch, handler)
    model = Nemotron(replace(settings, openrouter_api_key="test-key"))
    try:
        for stage in MODELS:
            await model.complete(stage, [{"role": "user", "content": "test"}])
    finally:
        await model.close()
    assert models == list(MODELS.values())


@pytest.mark.parametrize("primary_status", [400, 422])
async def test_bad_requests_are_not_hidden_by_provider_switching(settings, monkeypatch, primary_status):
    hosts = []
    def handler(request):
        hosts.append(request.url.host)
        return httpx.Response(primary_status, json={"error": {"message": "invalid request"}})
    install_transport(monkeypatch, handler)
    model = Nemotron(replace(settings, openrouter_api_key="test-key"))
    try:
        with pytest.raises(ModelUnavailable):
            await model.complete("guard", [{"role": "user", "content": "test"}])
    finally:
        await model.close()
    assert hosts == ["api.meterless.io"]


@pytest.mark.parametrize("finish_reason", ["length", "content_filter"])
async def test_truncated_or_refused_output_never_switches_provider(settings, monkeypatch, finish_reason):
    hosts = []
    def handler(request):
        hosts.append(request.url.host)
        return httpx.Response(200, json=completion(MODELS["guard"], finish_reason=finish_reason))
    install_transport(monkeypatch, handler)
    model = Nemotron(replace(settings, openrouter_api_key="test-key"))
    try:
        with pytest.raises(ModelUnavailable, match="incomplete"):
            await model.complete("guard", [{"role": "user", "content": "test"}])
    finally:
        await model.close()
    assert hosts == ["api.meterless.io"]


async def test_openrouter_only_exhaustion_fails_without_paid_fallback(settings, monkeypatch):
    requests = []
    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(429, json={"error": {"message": "free tier exhausted"}})
    install_transport(monkeypatch, handler)
    model = Nemotron(replace(settings, meterless_api_key="", openrouter_api_key="test-key"))
    try:
        with pytest.raises(ModelUnavailable, match="via openrouter"):
            await model.complete("guard", [{"role": "user", "content": "test"}])
    finally:
        await model.close()
    assert [request["model"] for request in requests] == [OPENROUTER_MODEL]


@pytest.mark.parametrize("with_primary", [True, False])
def test_full_sse_pipeline_and_health_report_actual_fallback_routes(settings, database, monkeypatch, with_primary):
    config = replace(settings, meterless_api_key="test-primary-key" if with_primary else "", openrouter_api_key="test-fallback-key")
    scripted = ScriptedNemotron(config)
    async def handler(request):
        body = json.loads(request.content)
        if request.url.host != "openrouter.ai":
            return httpx.Response(503, json={"error": {"message": "test primary outage"}})
        prompt = body["messages"][0]["content"]
        stage = "guard" if prompt == GUARD_PROMPT else "planner" if prompt == PLANNER_PROMPT else "synthesizer"
        reply = await scripted.complete(stage, body["messages"], body.get("tools"))
        payload = completion(OPENROUTER_MODEL)
        payload["choices"][0]["message"] = reply.model_dump(exclude_none=True)
        payload["choices"][0]["finish_reason"] = "tool_calls" if reply.tool_calls else "stop"
        return httpx.Response(200, json=payload)
    install_transport(monkeypatch, handler)
    with TestClient(create_app(config)) as client:
        health = client.get("/api/health").json()
        assert health["status"] == "ready"
        assert health["openrouter"]["configured"]
        assert health["model_runtime"]["configured"]
        response = client.post("/api/investigate/TXN-9003?stream=true")
        events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
        assert events[-1]["type"] == "result"
        result = events[-1]["result"]
        assert result["verdict"] == "ESCALATED" and result["guard"]["injection_detected"]
        assert set(result["models"].values()) == {OPENROUTER_MODEL}
        successes = [event for event in result["model_routes"] if event["status"] == "completed"]
        assert {event["stage"] for event in successes} == set(MODELS)
        assert all(event["provider"] == "openrouter" and event["fallback"] for event in successes)
        assert all("SYSTEM OVERRIDE" not in json.dumps(messages) for stage, messages in scripted.calls if stage != "guard")
        assert len(database.memory("KYC-HELIOS")) == 1

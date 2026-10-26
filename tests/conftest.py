"""Deterministic provider doubles exist only in tests, never in app runtime."""
import json
from types import SimpleNamespace

import pytest
from openai.types.chat import ChatCompletionMessage, ChatCompletionMessageFunctionToolCall
from openai.types.chat.chat_completion_message_function_tool_call import Function

from backend.config import MODELS, OPENROUTER_MODELS, Settings
from backend.services.database import Database
from scripts.seed_open_data import seed


@pytest.fixture
def settings(tmp_path):
    return Settings(sqlite_path=str(tmp_path / "test.db"), database_url="", mongodb_uri="",
                    meterless_api_key="test-key-not-a-real-credential", openrouter_api_key="", zetaris_api_url="", zetaris_api_key="",
                    allow_local_fallback=True, api_key="")


@pytest.fixture
def database(settings):
    seed(settings, offline=True)
    return Database(settings)


def message(payload):
    return ChatCompletionMessage(role="assistant", content=json.dumps(payload))


class ScriptedNemotron:
    """Exercises real orchestration, SQL, evidence checks and persistence offline."""
    instances = []
    reject_verification = False
    forge_citation = False
    invalid_guard = False
    skip_tools = False

    def __init__(self, settings):
        self.settings = settings
        self.calls = []
        self.round = 0
        self.closed = False
        self.instances.append(self)

    def route_for(self, stage):
        fallback = not self.settings.meterless_api_key
        return {"model": OPENROUTER_MODELS[stage] if fallback else MODELS[stage],
                "provider": "openrouter" if fallback else "meterless", "fallback": fallback,
                "fallback_reason": "Meterless/NIM key is not configured" if fallback else None}

    async def close(self):
        self.closed = True

    async def complete(self, stage, messages, tools=None):
        self.calls.append((stage, messages.copy()))
        if stage == "guard":
            if self.invalid_guard:
                return message({"injection_detected": "false", "reason": "Invalid boolean"})
            return message({"injection_detected": "SYSTEM OVERRIDE" in messages[-1]["content"], "reason": "Memo inspected as untrusted data."})
        if stage == "planner":
            if self.skip_tools:
                return ChatCompletionMessage(role="assistant", content="No evidence was fetched.")
            txn = json.loads(messages[1]["content"])["transaction"]
            root = txn["beneficiary_id"]
            owners = [root, "KYC-ELENA"] if root == "KYC-AURORA" else [root, "KYC-ALBA", "KYC-VIKTOR"]
            batches = [[("get_transaction_context", {}), ("lookup_entity", {"entity_id": root})]]
            for i, entity in enumerate(owners):
                steps = [("screen_entity", {"entity_id": entity})]
                if i < len(owners) - 1:
                    steps.append(("get_owners", {"entity_id": entity}))
                batches.append(steps)
            batches.append([("cross_silo_sanctions_check", {})])
            if self.round >= len(batches):
                return ChatCompletionMessage(role="assistant", content="Collected ownership and screening evidence.")
            batch = batches[self.round]
            self.round += 1
            return ChatCompletionMessage(role="assistant", tool_calls=[ChatCompletionMessageFunctionToolCall(
                id=f"call-{self.round}-{i}", type="function", function=Function(name=name, arguments=json.dumps(args))
            ) for i, (name, args) in enumerate(batch)])
        bundle = json.loads(messages[1]["content"])
        if "narrative" in bundle:
            return message({"supported": not self.reject_verification,
                            "supported_claims": list(range(len(bundle["narrative"]["claims"]))),
                            "reason": "Test-only verifier response."})
        claims = []
        for citation, row in bundle["evidence"].items():
            if citation.startswith("aml_transactions"):
                field = "amount_cents"
                text = f"The fictional demo wire amount is {row[field] / 100:,.2f} USD."
            else:
                field = "entity_name" if "entity_name" in row else "name"
                text = f"The fictional demo record names {row[field]}."
            claims.append({"text": f"{text} [CITE: {citation}]", "facts": [{"citation": citation, "field": field, "value": row[field]}]})
        if len(claims) == 1:
            row = next(iter(bundle["evidence"].values()))
            citation = next(iter(bundle["evidence"]))
            claims.append({"text": f"The wire is demo data. [CITE: {citation}]", "facts": [{"citation": citation, "field": "is_demo", "value": row["is_demo"]}]})
        if self.forge_citation:
            claims[0]["facts"][0]["value"] = -999
        return message({"verdict": bundle["policy"]["verdict"], "claims": claims})


@pytest.fixture
def model_double(monkeypatch):
    class TestModel(ScriptedNemotron):
        instances = []
    monkeypatch.setattr("backend.agent.Nemotron", TestModel)
    return TestModel

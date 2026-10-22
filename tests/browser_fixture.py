"""Explicit test-only API for browser QA: uvicorn tests.browser_fixture:app --port 8001.

Uses a temporary database and provider doubles; never loads real provider credentials.
"""
import asyncio
import tempfile

import backend.agent
from backend.config import Settings
from backend.main import create_app
from scripts.seed_open_data import seed
from tests.conftest import ScriptedNemotron


class BrowserTestModel(ScriptedNemotron):
    async def complete(self, stage, messages, tools=None):
        await asyncio.sleep(0.08)
        return await super().complete(stage, messages, tools)


directory = tempfile.TemporaryDirectory(prefix="prooftrace-browser-test-")
settings = Settings(sqlite_path=f"{directory.name}/fixture.db", database_url="", mongodb_uri="",
                    meterless_api_key="test-only", zetaris_api_url="", zetaris_api_key="", api_key="",
                    allow_local_fallback=True)
seed(settings, offline=True)
backend.agent.Nemotron = BrowserTestModel
app = create_app(settings)

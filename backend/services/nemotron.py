"""The only model provider adapter used by the application."""
import json
import re

from openai import AsyncOpenAI, OpenAIError

from backend.config import MODELS, Settings


class ModelUnavailable(RuntimeError):
    pass


def json_object(content: str | None) -> dict:
    if not content:
        raise ValueError("Model returned no JSON")
    text = re.sub(r"<think>.*?</think>", "", content, flags=re.S).strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    result = json.loads(text)
    if not isinstance(result, dict):
        raise ValueError("Expected a JSON object")
    return result


class Nemotron:
    def __init__(self, settings: Settings):
        if not settings.meterless_api_key:
            raise ModelUnavailable("Set METERLESS_API_KEY to run NVIDIA Nemotron investigations")
        self.client = AsyncOpenAI(api_key=settings.meterless_api_key, base_url=settings.meterless_base_url,
                                  timeout=settings.model_timeout, max_retries=1)

    async def complete(self, stage: str, messages: list[dict], tools: list[dict] | None = None):
        if stage not in MODELS:
            raise ValueError("Unknown NVIDIA Nemotron routing stage")
        options = {"model": MODELS[stage], "messages": messages, "temperature": 0,
                   "max_tokens": 3500 if stage == "synthesizer" else 1800}
        if tools:
            options.update(tools=tools, tool_choice="auto")
        try:
            response = await self.client.chat.completions.create(**options)
            choice = response.choices[0]
            if choice.finish_reason not in ("stop", "tool_calls"):
                raise ModelUnavailable("Nemotron output was incomplete; no verdict was saved")
            return choice.message
        except OpenAIError:
            raise ModelUnavailable("NVIDIA Nemotron request failed; check Meterless/NIM credentials and model access") from None

    async def close(self):
        await self.client.close()

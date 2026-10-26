"""Fixed NVIDIA model routes with 3 stage-specific free OpenRouter NVIDIA models."""
import json
import re
from collections.abc import Awaitable, Callable

from openai import APIConnectionError, APIStatusError, AsyncOpenAI, OpenAIError

from backend.config import MODELS, OPENROUTER_BASE_URL, OPENROUTER_MODELS, Settings


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
        if not settings.models_configured:
            raise ModelUnavailable("Set METERLESS_API_KEY or OPENROUTER_API_KEY to run NVIDIA Nemotron investigations")
        self.client = (AsyncOpenAI(api_key=settings.meterless_api_key, base_url=settings.meterless_base_url,
                                  timeout=settings.model_timeout, max_retries=0 if settings.openrouter_api_key else 1)
                       if settings.meterless_api_key else None)
        self.fallback_client = (AsyncOpenAI(api_key=settings.openrouter_api_key, base_url=OPENROUTER_BASE_URL,
                                           timeout=settings.model_timeout, max_retries=0)
                                if settings.openrouter_api_key else None)
        self.fallback_stages: dict[str, str] = {}
        self.openrouter_stage_models: dict[str, str] = dict(OPENROUTER_MODELS)
        self.on_route: Callable[[dict], Awaitable[None]] | None = None

    def route_for(self, stage: str) -> dict:
        if stage not in MODELS:
            raise ValueError("Unknown NVIDIA Nemotron routing stage")
        fallback = self.client is None or stage in self.fallback_stages
        return {
            "model": self.openrouter_stage_models[stage] if fallback else MODELS[stage],
            "provider": "openrouter" if fallback else "meterless",
            "fallback": fallback,
            "fallback_reason": self.fallback_stages.get(stage, "Meterless/NIM key is not configured" if fallback else None),
        }

    async def _notify(self, stage: str, route: dict, status: str, **extra) -> None:
        if self.on_route:
            await self.on_route({"stage": stage, **route, "status": status, **extra})

    @staticmethod
    def _can_fallback(exc: OpenAIError) -> bool:
        return isinstance(exc, APIConnectionError) or (isinstance(exc, APIStatusError) and (
            exc.status_code in {401, 402, 403, 404, 408, 409, 429} or exc.status_code >= 500))

    async def complete(self, stage: str, messages: list[dict], tools: list[dict] | None = None):
        route = self.route_for(stage)
        # Allow primary -> OpenRouter switch, plus cascading across the 3 free NVIDIA models if one free endpoint is down/rate-limited.
        candidates = [route["model"]] + [m for m in OPENROUTER_MODELS.values() if m != self.openrouter_stage_models[stage]]
        attempted_openrouter: set[str] = set()
        for _ in range(len(candidates) + 1):
            client = self.fallback_client if route["fallback"] else self.client
            options = {"model": route["model"], "messages": messages, "temperature": 0,
                       "max_tokens": 3500 if stage == "synthesizer" else 1800}
            if tools:
                options.update(tools=tools, tool_choice="auto")
            if route["fallback"]:
                attempted_openrouter.add(route["model"])
                # Strictly free NVIDIA models only.
                options["extra_body"] = {
                    "provider": {"require_parameters": True, "max_price": {"prompt": 0, "completion": 0}},
                    "reasoning": {"enabled": False},
                }
            await self._notify(stage, route, "running")
            try:
                response = await client.chat.completions.create(**options)
            except OpenAIError as exc:
                # Error class/status only: provider messages may contain sensitive request data.
                failure = f"{type(exc).__name__}" + (f" (HTTP {exc.status_code})" if isinstance(exc, APIStatusError) else "")
                await self._notify(stage, route, "failed", failure=failure)
                if not route["fallback"] and self.fallback_client and self._can_fallback(exc):
                    self.fallback_stages[stage] = f"Meterless/NIM request failed: {failure}"
                    route = self.route_for(stage)
                    continue
                if route["fallback"] and self._can_fallback(exc):
                    next_free = next((m for m in OPENROUTER_MODELS.values() if m not in attempted_openrouter), None)
                    if next_free:
                        self.openrouter_stage_models[stage] = next_free
                        self.fallback_stages[stage] = f"OpenRouter {route['model']} unavailable ({failure}); switched to {next_free}"
                        route = self.route_for(stage)
                        continue
                raise ModelUnavailable(f"NVIDIA Nemotron request failed via {route['provider']}; check credentials, model access and rate limits") from None
            if not response.choices or response.choices[0].finish_reason not in ("stop", "tool_calls"):
                await self._notify(stage, route, "failed", failure="Incomplete or refused model output")
                raise ModelUnavailable("Nemotron output was incomplete; no verdict was saved")
            await self._notify(stage, route, "completed", reported_model=response.model)
            return response.choices[0].message
        raise ModelUnavailable("NVIDIA Nemotron providers are unavailable")

    async def close(self):
        try:
            if self.client:
                await self.client.close()
        finally:
            if self.fallback_client:
                await self.fallback_client.close()

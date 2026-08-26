"""Groq LLM access for synthesis, extraction and the critic.

The module degrades explicitly rather than silently: with no API key, calls
raise LLMUnavailable, and callers turn that into an abstention with a stated
reason. It must never turn into a fabricated answer.
"""
from __future__ import annotations
import json, re
from typing import Any

from backend.config import GROQ_API_KEY, GROQ_MODEL


class LLMUnavailable(RuntimeError):
    """No API key configured, or the provider call failed."""


_client = None


def available() -> bool:
    return bool(GROQ_API_KEY)


def _get_client():
    global _client
    if not GROQ_API_KEY:
        raise LLMUnavailable(
            "GROQ_API_KEY is not set. Add it to .env — see .env.example.")
    if _client is None:
        from groq import Groq
        _client = Groq(api_key=GROQ_API_KEY)
    return _client


def _is_reasoning_model(model: str) -> bool:
    """gpt-oss and o-series style models spend tokens on hidden reasoning first."""
    m = model.lower()
    return "gpt-oss" in m or "reasoning" in m or m.startswith("o1") or m.startswith("o3")


def chat(messages: list[dict[str, str]], *, temperature: float = 0.1,
         max_tokens: int = 4096, model: str | None = None,
         json_mode: bool = False, reasoning_effort: str | None = None) -> str:
    client = _get_client()
    model = model or GROQ_MODEL
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    if _is_reasoning_model(model):
        # Reasoning tokens are drawn from the same budget as the answer. Keep the
        # effort low (this is extraction/verification, not open-ended reasoning)
        # and make sure the budget is large enough that the visible answer
        # survives — otherwise `content` comes back empty and looks like success.
        kwargs["reasoning_effort"] = reasoning_effort or "low"
        kwargs["max_tokens"] = max(max_tokens, 3000)
    try:
        resp = client.chat.completions.create(**kwargs)
    except Exception as e:  # noqa: BLE001 — surface as unavailable, never as a guess
        raise LLMUnavailable(f"{type(e).__name__}: {e}") from e

    choice = resp.choices[0]
    content = (choice.message.content or "").strip()
    if not content:
        # Never let an empty completion pass silently as a valid answer.
        raise LLMUnavailable(
            f"model returned no content (finish_reason={choice.finish_reason}, "
            f"completion_tokens={getattr(resp.usage, 'completion_tokens', '?')}); "
            f"raise max_tokens or lower reasoning_effort")
    return content


_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.S)


def chat_json(messages: list[dict[str, str]], **kw) -> Any:
    """Chat and parse JSON, tolerating fenced output from the model."""
    raw = chat(messages, json_mode=True, **kw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = _FENCE.search(raw)
        if m:
            try:
                return json.loads(m.group(1))
            except json.JSONDecodeError:
                pass
        brace = raw.find("{")
        if brace >= 0:
            try:
                return json.loads(raw[brace:raw.rfind("}") + 1])
            except json.JSONDecodeError:
                pass
        raise LLMUnavailable(f"model did not return valid JSON: {raw[:200]!r}")

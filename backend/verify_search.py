"""Network-free checks for Tavily retrieval and optional Gemini summaries.

All upstream responses below are synthetic fixtures; this script never sends a
query to Tavily or Google and never reads or prints a real API key.
"""
from __future__ import annotations

import email.message
import io
import json
import os
import sys
import urllib.error
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gemini  # noqa: E402
import tavily_search  # noqa: E402


class _Response:
    def __init__(self, payload: dict):
        self.payload = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self) -> bytes:
        return self.payload


def _http_error(url: str, code: int, body: dict, retry_after: str | None = None) -> urllib.error.HTTPError:
    headers = email.message.Message()
    if retry_after:
        headers["Retry-After"] = retry_after
    return urllib.error.HTTPError(url, code, "Upstream error", headers, io.BytesIO(json.dumps(body).encode()))


def test_gemini_generate_content_is_text_only() -> None:
    seen: dict = {}

    def fake_urlopen(request, timeout=120):
        seen["url"] = request.full_url
        seen["method"] = request.get_method()
        seen["payload"] = json.loads(request.data)
        seen["api_key"] = request.get_header("X-goog-api-key")
        seen["timeout"] = timeout
        return _Response({"fixture": "ok"})

    with patch.object(gemini, "_get_key", return_value="fixture-only-key"), patch.object(gemini.urllib.request, "urlopen", fake_urlopen):
        response = gemini._generate("gemini-3.5-flash-lite", "Fixture text-only prompt", max_output_tokens=321)
    assert response == {"fixture": "ok"}
    assert seen["url"].endswith("/models/gemini-3.5-flash-lite:generateContent")
    assert seen["method"] == "POST" and seen["api_key"] == "fixture-only-key"
    assert seen["payload"]["contents"] == [{"parts": [{"text": "Fixture text-only prompt"}]}]
    assert seen["payload"]["generationConfig"]["maxOutputTokens"] == 321
    assert "tools" not in seen["payload"]
    assert "google_search" not in json.dumps(seen["payload"]).lower()


def test_tavily_keyless_parser_and_rate_limit() -> list[dict[str, str]]:
    fixture = {
        "query": "fixture query",
        "results": [
            {"title": "<b>Clean</b> &amp; clear", "url": "https://example.com/article", "content": "<b>Readable</b> snippet <script>discard()</script> text."},
            {"title": "Duplicate", "url": "https://example.com/article", "content": "Duplicate row."},
            {"title": "Do not render", "url": "http://insecure.test/page", "content": "HTTP links are excluded."},
            {"title": "Bad scheme", "url": "javascript:alert(1)", "content": "Unsafe."},
        ],
    }
    seen: dict = {}

    def fake_urlopen(request, timeout=45):
        seen["header"] = request.get_header("X-tavily-access-mode")
        seen["authorization"] = request.get_header("Authorization")
        seen["payload"] = json.loads(request.data)
        seen["timeout"] = timeout
        return _Response(fixture)

    with patch.object(tavily_search.urllib.request, "urlopen", fake_urlopen):
        parsed = tavily_search.search("  fixture query  ")
    assert seen["header"] == "keyless"
    assert seen["authorization"] is None
    assert seen["payload"]["search_depth"] == "basic"
    assert seen["payload"]["max_results"] == 8
    assert seen["payload"]["include_answer"] is False
    assert parsed["provider"] == "tavily-keyless" and parsed["total"] == 1
    assert parsed["query"] == "fixture query"
    assert parsed["results"] == [{
        "title": "Clean & clear",
        "uri": "https://example.com/article",
        "snippet": "Readable snippet text.",
    }]

    error_body = {"detail": "Keyless request rate limit reached."}
    error = tavily_search._api_error(_http_error("https://api.tavily.com/search", 429, error_body, "3"))
    assert error.status_code == 429 and error.retry_after == 3
    assert "free but rate-limited" in str(error)
    assert "no card" in str(error)
    return parsed["results"]


def test_gemini_summary_uses_only_supplied_sources() -> None:
    seen: dict = {}

    def fake_generate(model: str, prompt: str, *, max_output_tokens: int):
        seen["model"] = model
        seen["prompt"] = prompt
        seen["max_output_tokens"] = max_output_tokens
        return {"candidates": [{"content": {"parts": [{"text": "Fixture summary [1]. Unsupported marker [99]."}]}}]}

    sources = [{"title": "Fixture source", "uri": "https://example.com/source", "snippet": "A supported fact."}]
    with patch.object(gemini, "_generate", fake_generate):
        result = gemini.summarize_search_results("fixture query", sources, "gemini-3.5-flash-lite")
    assert seen["model"] == "gemini-3.5-flash-lite"
    assert "fixture query" in seen["prompt"] and "A supported fact." in seen["prompt"]
    assert "google_search" not in seen["prompt"].lower()
    assert seen["max_output_tokens"] == 1600
    assert result == {"text": "Fixture summary [1]. Unsupported marker .", "model": "gemini-3.5-flash-lite"}

    error_body = {"error": {
        "code": 429,
        "status": "RESOURCE_EXHAUSTED",
        "message": "Text generation quota exhausted.",
        "details": [
            {"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [{"quotaMetric": "fixture_gemini_requests", "quotaValue": "0"}]},
            {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "2.5s"},
        ],
    }}
    error = gemini._google_http_error(_http_error("https://generativelanguage.googleapis.com", 429, error_body))
    assert error.status_code == 429 and error.google_status == "RESOURCE_EXHAUSTED"
    assert error.retry_after == 2.5 and "fixture_gemini_requests" in str(error)
    assert "Search grounding" not in str(error)


if __name__ == "__main__":
    results = test_tavily_keyless_parser_and_rate_limit()
    print("PASS Tavily keyless request shape, clean HTTPS result parsing, and free rate-limit diagnostics")
    test_gemini_generate_content_is_text_only()
    print("PASS Gemini uses ordinary text generation without grounding tools")
    test_gemini_summary_uses_only_supplied_sources()
    print("PASS Gemini text-only summaries cite supplied Tavily sources without Search grounding")
    print("These tests use fixtures only; no Tavily or Google API request was made.")

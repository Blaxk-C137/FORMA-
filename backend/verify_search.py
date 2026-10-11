"""Network-free checks for the optional Google search adapters.

All credentials and API responses below are test fixtures; this script never
contacts Google and never prints or reads a real API key.
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
import google_agent_search  # noqa: E402


class _Response:
    def __init__(self, payload: dict):
        self.payload = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self) -> bytes:
        return self.payload


def _http_error(url: str, body: dict, retry_after: str | None = None) -> urllib.error.HTTPError:
    headers = email.message.Message()
    if retry_after:
        headers["Retry-After"] = retry_after
    return urllib.error.HTTPError(url, 429, "Too Many Requests", headers, io.BytesIO(json.dumps(body).encode()))


def test_gemini_interactions_parser_and_quota_error() -> None:
    fixture = {
        "status": "completed",
        "steps": [
            {"type": "google_search_call", "arguments": {"queries": ["fixture query"]}},
            {"type": "google_search_result", "result": [{"search_suggestions": "<div>fixture suggestion</div>"}]},
            {"type": "model_output", "content": [{
                "type": "text",
                "text": "Fixture answer.",
                "annotations": [{"type": "url_citation", "url": "https://example.com/source", "title": "Fixture source", "start_index": 0, "end_index": 15}],
            }]},
        ],
    }
    seen: dict = {}

    def fake_request(_method: str, path: str, _key: str, payload: dict | None = None):
        seen["path"] = path
        seen["payload"] = payload
        return fixture

    with patch.dict(os.environ, {"FORMA_GEMINI_API_KEY": "fixture-not-a-real-key"}, clear=False):
        with patch.object(gemini, "_request", fake_request):
            parsed = gemini.search("fixture query", "gemini-3.5-flash-lite")
    assert seen["path"] == "/interactions"
    assert seen["payload"]["store"] is False
    assert parsed["text"] == "Fixture answer. [1]"
    assert parsed["sources"] == [{"title": "Fixture source", "uri": "https://example.com/source"}]
    assert parsed["queries"] == ["fixture query"]
    assert parsed["search_entry_point"] == "<div>fixture suggestion</div>"

    error_body = {"error": {
        "code": 429,
        "status": "RESOURCE_EXHAUSTED",
        "message": "Grounding quota exhausted.",
        "details": [
            {"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [{"quotaMetric": "fixture_grounding_requests", "quotaValue": "0"}]},
            {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "2.5s"},
        ],
    }}
    error = gemini._google_http_error(_http_error("https://example.test", error_body))
    assert error.status_code == 429 and error.google_status == "RESOURCE_EXHAUSTED"
    assert error.retry_after == 2.5 and "fixture_grounding_requests" in str(error)


def test_agent_search_parser_and_quota_error() -> None:
    fixture = {"totalSize": 2, "results": [
        {"document": {"derivedStructData": {
            "link": "https://example.com/article",
            "title": "<b>Clean</b> &amp; clear",
            "snippets": [{"snippet": "<b>Readable</b> result text <script>unsafe()</script>."}],
        }}},
        {"document": {"derivedStructData": {"link": "gs://not-a-web-result", "title": "Do not render"}}},
    ]}
    seen: dict = {}

    def fake_urlopen(request, timeout=45):
        seen["host"] = request.full_url.split("/")[2]
        seen["payload"] = json.loads(request.data)
        return _Response(fixture)

    env = {
        "FORMA_AGENT_SEARCH_API_KEY": "fixture-not-a-real-key",
        "FORMA_AGENT_SEARCH_PROJECT_ID": "forma-demo-123",
        "FORMA_AGENT_SEARCH_ENGINE_ID": "fixture-sites-app",
        "FORMA_AGENT_SEARCH_LOCATION": "global",
    }
    with patch.dict(os.environ, env, clear=False):
        with patch.object(google_agent_search.urllib.request, "urlopen", fake_urlopen):
            parsed = google_agent_search.search("  fixture query  ")
    assert seen["host"] == "discoveryengine.googleapis.com"
    assert seen["payload"]["pageSize"] == 10
    assert parsed["total"] == 2 and len(parsed["results"]) == 1
    assert parsed["results"][0] == {
        "title": "Clean & clear",
        "uri": "https://example.com/article",
        "snippet": "Readable result text .",
    }
    regional_env = {**env, "FORMA_AGENT_SEARCH_LOCATION": "us"}
    with patch.dict(os.environ, regional_env, clear=False):
        with patch.object(google_agent_search.urllib.request, "urlopen", fake_urlopen):
            google_agent_search.search("fixture query")
    assert seen["host"] == "us-discoveryengine.googleapis.com"

    error_body = {"error": {
        "code": 429,
        "status": "RESOURCE_EXHAUSTED",
        "message": "Agent Search quota exhausted.",
        "details": [{"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [{"quotaMetric": "fixture_agent_search_requests", "quotaValue": "0"}]}],
    }}
    error = google_agent_search._api_error(_http_error("https://example.test", error_body, "4"))
    assert error.status_code == 429 and error.retry_after == 4
    assert "fixture_agent_search_requests" in str(error)


if __name__ == "__main__":
    test_gemini_interactions_parser_and_quota_error()
    print("PASS Gemini Interactions citations, Search Suggestions, store:false, and quota details")
    test_agent_search_parser_and_quota_error()
    print("PASS Google Agent Search clean cards, URL filtering, and quota details")
    print("PASS region-specific Agent Search endpoint routing")
    print("These tests use fixtures only; no Google API request was made.")

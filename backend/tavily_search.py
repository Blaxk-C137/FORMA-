"""Free, keyless Tavily web search adapter.

The query is sent server-side only after the user clicks Search. Keyless access
uses no account, API key, or billing credential; Tavily documents it as free
but rate-limited. Results are structured snippets, not an AI-generated answer.
"""
from __future__ import annotations

import html
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from typing import Any

API_URL = "https://api.tavily.com/search"
MAX_RESULTS = 8


class TavilySearchError(RuntimeError):
    """Safe-to-display Tavily search failure."""


class TavilySearchApiError(TavilySearchError):
    def __init__(self, message: str, *, status_code: int, retry_after: float | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.retry_after = retry_after


class _PlainText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"script", "style"}:
            self.skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style"} and self.skip_depth:
            self.skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.skip_depth:
            self.parts.append(data)


def _plain_text(value: Any, max_length: int) -> str:
    if not isinstance(value, str):
        return ""
    parser = _PlainText()
    try:
        parser.feed(value)
        text = " ".join(parser.parts)
    except Exception:  # noqa: BLE001
        text = re.sub(r"<[^>]*>", " ", value)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_length]


def _retry_seconds(value: Any) -> float | None:
    if not isinstance(value, str):
        return None
    match = re.fullmatch(r"\s*([0-9]+(?:\.[0-9]+)?)\s*", value)
    if match:
        return max(0.0, float(match.group(1)))
    match = re.fullmatch(r"\s*([0-9]+(?:\.[0-9]+)?)s\s*", value)
    return max(0.0, float(match.group(1))) if match else None


def _api_error(exc: urllib.error.HTTPError) -> TavilySearchApiError:
    try:
        data = json.loads(exc.read().decode("utf-8", "replace"))
    except Exception:  # noqa: BLE001
        data = {}
    if isinstance(data, dict):
        detail = data.get("detail") or data.get("message") or data.get("error")
        if isinstance(detail, dict):
            detail = detail.get("message") or detail.get("detail")
    else:
        detail = None
    upstream_message = _plain_text(str(detail or ""), 420)
    retry_after = _retry_seconds(exc.headers.get("Retry-After")) if exc.headers else None
    parts = [f"Tavily keyless search returned HTTP {exc.code}."]
    if upstream_message:
        parts.append(upstream_message)
    if exc.code in (429, 432):
        parts.append("Tavily's no-key service is free but rate-limited. Wait and try again, or use Tavily's optional free API-key plan (1,000 credits/month, no card); Forma does not enable paid billing.")
    if retry_after is not None:
        parts.append(f"Retry after about {retry_after:g} seconds.")
    return TavilySearchApiError(" ".join(parts), status_code=exc.code if 400 <= exc.code <= 599 else 502, retry_after=retry_after)


def search(query: str) -> dict[str, Any]:
    cleaned_query = query.strip()
    if not cleaned_query:
        raise TavilySearchError("Type or speak a query before searching.")
    if len(cleaned_query) > 2_000:
        raise TavilySearchError("Keep a web search query under 2,000 characters.")

    payload = {
        "query": cleaned_query,
        "search_depth": "basic",
        "max_results": MAX_RESULTS,
        "include_answer": False,
        "include_raw_content": False,
        "include_images": False,
        "include_favicon": False,
    }
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Tavily-Access-Mode": "keyless",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        raise _api_error(exc) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise TavilySearchError("Could not reach Tavily. Check the internet connection and try again.") from exc
    try:
        response_data = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise TavilySearchError("Tavily returned an unreadable response.") from exc
    if not isinstance(response_data, dict):
        raise TavilySearchError("Tavily returned an unexpected response.")

    results: list[dict[str, str]] = []
    seen: set[str] = set()
    rows = response_data.get("results", [])
    if isinstance(rows, list):
        for row in rows:
            if not isinstance(row, dict):
                continue
            uri = str(row.get("url", "")).strip()
            parsed_uri = urllib.parse.urlparse(uri)
            if parsed_uri.scheme != "https" or not parsed_uri.netloc or uri in seen:
                continue
            title = _plain_text(row.get("title") or uri, 240) or uri
            snippet = _plain_text(row.get("content") or "", 1_000)
            seen.add(uri)
            results.append({"title": title, "uri": uri, "snippet": snippet})
            if len(results) >= MAX_RESULTS:
                break

    return {
        "provider": "tavily-keyless",
        "query": cleaned_query,
        "total": len(results),
        "results": results,
    }

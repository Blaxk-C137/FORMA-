"""Optional direct Google Agent Search integration.

Uses the Agent Search searchLite API so Google credentials remain in the local
backend/OS vault. This searches the public sites indexed by the user's Agent
Search app; it is not Gemini's general-web grounding endpoint.
"""
from __future__ import annotations

import html
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from typing import Any

from gemini import CredentialVaultUnavailable, _keyring_module

KEY_SERVICE = "Forma Voice Studio"
ACCOUNTS = {
    "api_key": "agent-search-api-key",
    "project_id": "agent-search-project-id",
    "engine_id": "agent-search-engine-id",
    "location": "agent-search-location",
}
ENV = {
    "api_key": "FORMA_AGENT_SEARCH_API_KEY",
    "project_id": "FORMA_AGENT_SEARCH_PROJECT_ID",
    "engine_id": "FORMA_AGENT_SEARCH_ENGINE_ID",
    "location": "FORMA_AGENT_SEARCH_LOCATION",
}
LOCATIONS = {"global", "us", "eu"}


class GoogleAgentSearchError(RuntimeError):
    """Safe-to-display direct Google search error."""


class GoogleAgentSearchApiError(GoogleAgentSearchError):
    def __init__(self, message: str, *, status_code: int, google_status: str | None = None,
                 retry_after: float | None = None, quota_metrics: list[str] | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.google_status = google_status
        self.retry_after = retry_after
        self.quota_metrics = quota_metrics or []


def _env_values() -> dict[str, str]:
    values = {field: os.environ.get(name, "").strip() for field, name in ENV.items()}
    if not values["location"]:
        values["location"] = "global"
    return values


def _read_config() -> tuple[dict[str, str], bool, str | None]:
    env = _env_values()
    if any(os.environ.get(name, "").strip() for name in ENV.values()):
        return env, False, "environment"
    try:
        keyring = _keyring_module()
    except CredentialVaultUnavailable:
        return {"api_key": "", "project_id": "", "engine_id": "", "location": "global"}, False, None
    try:
        values = {field: keyring.get_password(KEY_SERVICE, account) or "" for field, account in ACCOUNTS.items()}
    except Exception as exc:  # noqa: BLE001
        raise CredentialVaultUnavailable("Could not read Google Agent Search settings from the OS credential vault.") from exc
    if not values["location"]:
        values["location"] = "global"
    return values, True, "credential-vault" if values["api_key"] else None


def get_settings() -> dict[str, Any]:
    values, vault_available, source = _read_config()
    configured = bool(values["api_key"] and values["project_id"] and values["engine_id"])
    return {
        "configured": configured,
        "vault_available": vault_available,
        "key_source": source,
        "project_id": values["project_id"],
        "engine_id": values["engine_id"],
        "location": values["location"],
    }


def _validate_config(api_key: str, project_id: str, engine_id: str, location: str) -> dict[str, str]:
    key = api_key.strip()
    project = project_id.strip()
    engine = engine_id.strip()
    region = location.strip().lower() or "global"
    if not key or len(key) > 512 or any(ord(ch) < 32 for ch in key):
        raise GoogleAgentSearchError("Enter a valid Google Cloud API key.")
    if not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", project):
        raise GoogleAgentSearchError("Enter the Google Cloud project ID (6–30 lowercase letters, digits, or hyphens).")
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", engine):
        raise GoogleAgentSearchError("Enter the Agent Search app/engine ID (letters, digits, underscores, or hyphens).")
    if region not in LOCATIONS:
        raise GoogleAgentSearchError("Choose an Agent Search location: global, us, or eu.")
    return {"api_key": key, "project_id": project, "engine_id": engine, "location": region}


def save_settings(api_key: str, project_id: str, engine_id: str, location: str = "global") -> dict[str, Any]:
    values = _validate_config(api_key, project_id, engine_id, location)
    if any(os.environ.get(name, "").strip() for name in ENV.values()):
        raise GoogleAgentSearchError("Agent Search is managed by environment variables. Update FORMA_AGENT_SEARCH_* to change it.")
    keyring = _keyring_module()
    try:
        previous = {field: keyring.get_password(KEY_SERVICE, account) for field, account in ACCOUNTS.items()}
    except Exception as exc:  # noqa: BLE001
        raise CredentialVaultUnavailable("Could not read existing Google Agent Search settings from the OS credential vault.") from exc
    try:
        for field, account in ACCOUNTS.items():
            keyring.set_password(KEY_SERVICE, account, values[field])
        if any(keyring.get_password(KEY_SERVICE, account) != values[field] for field, account in ACCOUNTS.items()):
            raise CredentialVaultUnavailable("The OS credential vault did not confirm the Agent Search settings were saved.")
    except Exception as exc:  # noqa: BLE001
        for field, account in ACCOUNTS.items():
            try:
                if previous[field] is None:
                    keyring.delete_password(KEY_SERVICE, account)
                else:
                    keyring.set_password(KEY_SERVICE, account, previous[field])
            except Exception:  # noqa: BLE001
                pass
        if isinstance(exc, (CredentialVaultUnavailable, GoogleAgentSearchError)):
            raise
        raise CredentialVaultUnavailable("Could not save Google Agent Search settings in the OS credential vault.") from exc
    return get_settings()


def remove_settings() -> dict[str, Any]:
    if any(os.environ.get(name, "").strip() for name in ENV.values()):
        raise GoogleAgentSearchError("Agent Search is managed by environment variables. Remove FORMA_AGENT_SEARCH_* to disable it.")
    keyring = _keyring_module()
    for account in ACCOUNTS.values():
        try:
            keyring.delete_password(KEY_SERVICE, account)
        except Exception as exc:  # noqa: BLE001
            if "not found" not in str(exc).lower() and "password was not found" not in str(exc).lower():
                raise CredentialVaultUnavailable("Could not remove Google Agent Search settings from the OS credential vault.") from exc
    return get_settings()


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


def _result_snippet(derived: dict[str, Any]) -> str:
    snippets = derived.get("snippets", [])
    if isinstance(snippets, list):
        for item in snippets:
            if isinstance(item, dict) and str(item.get("snippet_status", "SUCCESS")).upper() == "SUCCESS":
                text = _plain_text(item.get("snippet"), 900)
                if text:
                    return text
    extractive = derived.get("extractive_answers", [])
    if isinstance(extractive, list):
        for item in extractive:
            if isinstance(item, dict):
                text = _plain_text(item.get("content"), 900)
                if text:
                    return text
    return _plain_text(derived.get("snippet"), 900)


def _retry_seconds(value: Any) -> float | None:
    if isinstance(value, dict):
        try:
            return max(0.0, float(value.get("seconds", 0)) + float(value.get("nanos", 0) or 0) / 1_000_000_000)
        except (TypeError, ValueError):
            return None
    if isinstance(value, (int, float)):
        return max(0.0, float(value))
    if isinstance(value, str):
        match = re.fullmatch(r"\s*([0-9]+(?:\.[0-9]+)?)s\s*", value)
        return float(match.group(1)) if match else None
    return None


def _api_error(exc: urllib.error.HTTPError) -> GoogleAgentSearchApiError:
    try:
        data = json.loads(exc.read().decode("utf-8", "replace"))
    except Exception:  # noqa: BLE001
        data = {}
    error = data.get("error", {}) if isinstance(data, dict) else {}
    if not isinstance(error, dict):
        error = {}
    message = str(error.get("message", "")).replace("\n", " ").strip()[:360]
    status = str(error.get("status", "")).strip() or None
    metrics: list[str] = []
    retry_after = None
    if exc.headers and exc.headers.get("Retry-After"):
        try:
            retry_after = max(0.0, float(exc.headers.get("Retry-After")))
        except (TypeError, ValueError):
            pass
    details = error.get("details", [])
    if isinstance(details, list):
        for detail in details:
            if not isinstance(detail, dict):
                continue
            type_name = str(detail.get("@type", ""))
            if "RetryInfo" in type_name:
                retry_after = retry_after or _retry_seconds(detail.get("retryDelay") or detail.get("retry_delay"))
            metadata = detail.get("metadata", {})
            if isinstance(metadata, dict):
                for key, value in metadata.items():
                    lowered = str(key).lower()
                    if "retry" in lowered and retry_after is None:
                        retry_after = _retry_seconds(value)
                    if "quota" in lowered and any(part in lowered for part in ("metric", "limit", "id")):
                        metrics.append(f"{key}: {str(value)[:120]}")
            violations = detail.get("violations", [])
            if isinstance(violations, list):
                for violation in violations:
                    if isinstance(violation, dict):
                        metric = violation.get("quotaMetric") or violation.get("quota_metric")
                        if metric:
                            metrics.append(str(metric)[:120])
    parts = [f"Google Agent Search returned HTTP {exc.code}{f' ({status})' if status else ''}."]
    if message:
        parts.append(message)
    if metrics:
        parts.append("Quota details: " + "; ".join(list(dict.fromkeys(metrics))[:3]) + ".")
    if retry_after is not None:
        parts.append(f"Google suggests retrying in about {retry_after:g} seconds.")
    if exc.code == 403:
        parts.append("Check that the app ID, project, Discovery Engine API, and API-key restrictions are correct.")
    elif exc.code == 429:
        parts.append("Agent Search quotas and billing apply to the configured Google Cloud project. Check the project's Agent Search quota and billing before retrying.")
    return GoogleAgentSearchApiError(" ".join(parts), status_code=exc.code if 400 <= exc.code <= 599 else 502,
                                     google_status=status, retry_after=retry_after, quota_metrics=list(dict.fromkeys(metrics)))


def search(query: str) -> dict[str, Any]:
    cleaned_query = query.strip()
    if not cleaned_query:
        raise GoogleAgentSearchError("Type or speak a query before searching.")
    if len(cleaned_query) > 2_000:
        raise GoogleAgentSearchError("Keep a web search query under 2,000 characters.")
    values, _, _ = _read_config()
    if not (values["api_key"] and values["project_id"] and values["engine_id"]):
        raise GoogleAgentSearchError("Configure a Google Agent Search API key, Cloud project ID, and app/engine ID in Settings first.")
    validated = _validate_config(values["api_key"], values["project_id"], values["engine_id"], values["location"])
    project, location, engine = validated["project_id"], validated["location"], validated["engine_id"]
    serving_config = f"projects/{project}/locations/{location}/collections/default_collection/engines/{engine}/servingConfigs/default_search"
    encoded_key = urllib.parse.quote(validated["api_key"], safe="")
    api_host = "discoveryengine.googleapis.com" if location == "global" else f"{location}-discoveryengine.googleapis.com"
    url = f"https://{api_host}/v1/{serving_config}:searchLite?key={encoded_key}"
    body = json.dumps({"servingConfig": serving_config, "query": cleaned_query, "pageSize": 10}).encode("utf-8")
    request = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "Accept": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise _api_error(exc) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise GoogleAgentSearchError("Could not reach Google Agent Search. Check the internet connection and Cloud API availability.") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise GoogleAgentSearchError("Google Agent Search returned an unreadable response.") from exc
    if not isinstance(payload, dict):
        raise GoogleAgentSearchError("Google Agent Search returned an unexpected response.")

    results: list[dict[str, str]] = []
    seen: set[str] = set()
    rows = payload.get("results", [])
    if isinstance(rows, list):
        for row in rows:
            if not isinstance(row, dict):
                continue
            document = row.get("document", {})
            if not isinstance(document, dict):
                continue
            derived = document.get("derivedStructData", {})
            structured = document.get("structData", {})
            if not isinstance(derived, dict):
                derived = {}
            if not isinstance(structured, dict):
                structured = {}
            uri = str(derived.get("link") or derived.get("url") or structured.get("link") or structured.get("url") or "").strip()
            parsed_uri = urllib.parse.urlparse(uri)
            if parsed_uri.scheme != "https" or not parsed_uri.netloc or uri in seen:
                continue
            title = _plain_text(derived.get("title") or structured.get("title") or uri, 240) or uri
            snippet = _result_snippet(derived)
            seen.add(uri)
            results.append({"title": title, "uri": uri, "snippet": snippet})

    try:
        total = int(payload.get("totalSize", len(results)))
    except (TypeError, ValueError):
        total = len(results)
    return {"provider": "google-agent-search", "query": cleaned_query, "total": max(total, len(results)), "results": results}

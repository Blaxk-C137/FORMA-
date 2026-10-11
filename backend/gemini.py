"""Optional Gemini Developer API integration.

Secrets are kept out of browser storage. On Windows, Python keyring uses the
Windows Credential Manager; on other desktops it uses the configured OS key
store. An environment variable is supported for managed installs/tests.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any

API_ROOT = "https://generativelanguage.googleapis.com/v1beta"
KEY_SERVICE = "Forma Voice Studio"
KEY_ACCOUNT = "gemini-api-key"
ALLOWED_MODELS = {
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.8-flash",
}
DEFAULT_MODEL = "gemini-3.5-flash-lite"


class GeminiError(RuntimeError):
    """Safe-to-display error for optional Gemini API requests."""


class GeminiApiError(GeminiError):
    """Upstream Google API failure with safe quota diagnostics."""

    def __init__(self, message: str, *, status_code: int, google_status: str | None = None,
                 google_code: int | None = None, retry_after: float | None = None,
                 quota_metrics: list[str] | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.google_status = google_status
        self.google_code = google_code
        self.retry_after = retry_after
        self.quota_metrics = quota_metrics or []


class CredentialVaultUnavailable(GeminiError):
    pass


def _keyring_module():
    try:
        import keyring

        backend = keyring.get_keyring()
        priority = getattr(backend, "priority", 0)
        if not isinstance(priority, (int, float)) or priority <= 0:
            raise CredentialVaultUnavailable(
                "No OS credential vault is available. On Windows, enable Windows Credential Manager; "
                "or set FORMA_GEMINI_API_KEY as an environment variable."
            )
        return keyring
    except CredentialVaultUnavailable:
        raise
    except Exception as exc:  # noqa: BLE001
        raise CredentialVaultUnavailable(
            "Could not access the OS credential vault. On Windows, enable Windows Credential Manager; "
            "or set FORMA_GEMINI_API_KEY as an environment variable."
        ) from exc


def _stored_key() -> str | None:
    try:
        keyring = _keyring_module()
        return keyring.get_password(KEY_SERVICE, KEY_ACCOUNT)
    except CredentialVaultUnavailable:
        return None


def get_settings() -> dict[str, Any]:
    env_key = os.environ.get("FORMA_GEMINI_API_KEY", "").strip()
    try:
        _keyring_module()
        vault_available = True
    except CredentialVaultUnavailable:
        vault_available = False
    saved_key = _stored_key() if vault_available and not env_key else None
    if env_key:
        source: str | None = "environment"
    elif saved_key:
        source = "credential-vault"
    else:
        source = None
    return {
        "configured": bool(env_key or saved_key),
        "vault_available": vault_available,
        "key_source": source,
        "model_default": DEFAULT_MODEL,
    }


def _get_key() -> str:
    env_key = os.environ.get("FORMA_GEMINI_API_KEY", "").strip()
    if env_key:
        return env_key
    try:
        keyring = _keyring_module()
        key = keyring.get_password(KEY_SERVICE, KEY_ACCOUNT)
    except CredentialVaultUnavailable:
        raise
    except Exception as exc:  # noqa: BLE001
        raise CredentialVaultUnavailable("Could not read the Gemini key from the OS credential vault.") from exc
    if not key:
        raise GeminiError("Add your Gemini API key in Settings before using this feature.")
    return key


def _retry_seconds(value: Any) -> float | None:
    if isinstance(value, dict):
        seconds = value.get("seconds")
        nanos = value.get("nanos", 0)
        try:
            return max(0.0, float(seconds) + float(nanos or 0) / 1_000_000_000)
        except (TypeError, ValueError):
            return None
    if isinstance(value, (int, float)):
        return max(0.0, float(value))
    if isinstance(value, str):
        match = re.fullmatch(r"\s*([0-9]+(?:\.[0-9]+)?)s\s*", value)
        if match:
            return max(0.0, float(match.group(1)))
    return None


def _google_http_error(exc: urllib.error.HTTPError) -> GeminiApiError:
    try:
        error_data = json.loads(exc.read().decode("utf-8", "replace"))
    except Exception:  # noqa: BLE001
        error_data = {}
    error = error_data.get("error", {}) if isinstance(error_data, dict) else {}
    if not isinstance(error, dict):
        error = {}
    upstream_message = str(error.get("message", "")).strip().replace("\n", " ")[:420]
    google_status = str(error.get("status", "")).strip() or None
    google_code = error.get("code") if isinstance(error.get("code"), int) else exc.code
    details = error.get("details", []) if isinstance(error.get("details", []), list) else []
    quota_metrics: list[str] = []
    retry_after: float | None = None
    header_retry = exc.headers.get("Retry-After") if exc.headers else None
    if header_retry:
        try:
            retry_after = max(0.0, float(header_retry))
        except (TypeError, ValueError):
            retry_after = None

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
                if "quota" in lowered and any(term in lowered for term in ("metric", "id", "limit")):
                    item = f"{key}: {str(value)[:140]}"
                    if item not in quota_metrics:
                        quota_metrics.append(item)
        violations = detail.get("violations", [])
        if isinstance(violations, list):
            for violation in violations:
                if not isinstance(violation, dict):
                    continue
                metric = violation.get("quotaMetric") or violation.get("quota_metric")
                limit = violation.get("quotaValue") or violation.get("quota_value") or violation.get("quotaLimit")
                description = violation.get("description")
                label = str(metric or description or "quota violation")[:140]
                if limit is not None:
                    label += f" (limit {str(limit)[:40]})"
                if label not in quota_metrics:
                    quota_metrics.append(label)

    if exc.code == 429:
        parts = [f"Google Gemini returned HTTP 429{f' ({google_status})' if google_status else ''}."]
        if upstream_message:
            parts.append(upstream_message)
        if quota_metrics:
            parts.append("Quota details: " + "; ".join(quota_metrics[:3]) + ".")
        if retry_after is not None:
            parts.append(f"Google suggests retrying in about {retry_after:g} seconds.")
        parts.append("Gemini limits are per Google project and model; Search grounding can have its own quota. Check that this key belongs to the project shown in AI Studio and inspect the reported metric before changing keys or retrying.")
    elif exc.code in (401, 403):
        parts = [f"Google rejected the Gemini request (HTTP {exc.code})."]
        if upstream_message:
            parts.append(upstream_message)
        parts.append("Check the API key, project access, billing tier, and whether this feature is enabled.")
    else:
        parts = [f"Google Gemini API returned HTTP {exc.code}."]
        if upstream_message:
            parts.append(upstream_message)

    return GeminiApiError(
        " ".join(parts),
        status_code=exc.code if 400 <= exc.code <= 599 else 502,
        google_status=google_status,
        google_code=google_code,
        retry_after=retry_after,
        quota_metrics=quota_metrics,
    )


def _request(method: str, path: str, api_key: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"x-goog-api-key": api_key, "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(f"{API_ROOT}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        raise _google_http_error(exc) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise GeminiError("Could not reach Google's Gemini API. Check your internet connection.") from exc
    try:
        result = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise GeminiError("Google returned an unreadable response.") from exc
    if not isinstance(result, dict):
        raise GeminiError("Google returned an unexpected response.")
    return result


def _validate_model(model: str | None) -> str:
    candidate = str(model or DEFAULT_MODEL)
    if candidate not in ALLOWED_MODELS:
        raise GeminiError("Select one of the stable Gemini models available in Settings.")
    return candidate


def save_key(api_key: str) -> dict[str, Any]:
    key = api_key.strip()
    if not key or len(key) > 512 or any(ord(ch) < 32 for ch in key):
        raise GeminiError("Enter a valid Gemini API key.")
    # Verify the credential with a non-generative, non-billable model-list call before persisting it.
    _request("GET", "/models", key)
    try:
        keyring = _keyring_module()
        keyring.set_password(KEY_SERVICE, KEY_ACCOUNT, key)
        if keyring.get_password(KEY_SERVICE, KEY_ACCOUNT) != key:
            raise CredentialVaultUnavailable("The OS credential vault did not confirm that the Gemini key was saved.")
    except CredentialVaultUnavailable:
        raise
    except Exception as exc:  # noqa: BLE001
        raise CredentialVaultUnavailable("Could not save the Gemini key in the OS credential vault.") from exc
    return get_settings()


def remove_key() -> dict[str, Any]:
    if os.environ.get("FORMA_GEMINI_API_KEY", "").strip():
        raise GeminiError("This key comes from FORMA_GEMINI_API_KEY. Remove it from the environment to disable Gemini.")
    keyring = _keyring_module()
    try:
        keyring.delete_password(KEY_SERVICE, KEY_ACCOUNT)
    except Exception as exc:  # noqa: BLE001
        # A missing entry is already equivalent to a cleared key.
        if "not found" not in str(exc).lower() and "password was not found" not in str(exc).lower():
            raise CredentialVaultUnavailable("Could not remove the Gemini key from the OS credential vault.") from exc
    return get_settings()


def _generate(model: str, prompt: str) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "contents": [{"parts": [{"text": prompt}]}],
        # Gemini 3 docs recommend leaving temperature at its default of 1.0.
        # A generous output cap avoids truncating longer transcript refurbishments.
        "generationConfig": {"maxOutputTokens": 32768},
    }
    return _request("POST", f"/models/{model}:generateContent", _get_key(), payload)


def _candidate_text(response: dict[str, Any]) -> str:
    candidates = response.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        feedback = response.get("promptFeedback")
        if isinstance(feedback, dict) and feedback.get("blockReason"):
            raise GeminiError("Gemini declined this request due to its safety filters. Edit the text or query and try again.")
        raise GeminiError("Gemini returned no text. Try again or choose another model.")
    candidate = candidates[0]
    content = candidate.get("content", {}) if isinstance(candidate, dict) else {}
    parts = content.get("parts", []) if isinstance(content, dict) else []
    text = "\n".join(str(part.get("text", "")) for part in parts if isinstance(part, dict) and part.get("text"))
    if not text.strip():
        raise GeminiError("Gemini returned no text. Try again or choose another model.")
    return text.strip()


def refurbish(text: str, model: str | None = None) -> dict[str, str]:
    original = text.strip()
    if not original:
        raise GeminiError("Add some text before asking Gemini to refurbish it.")
    if len(original) > 80_000:
        raise GeminiError("This text is too long for one refurbishment request. Split it into smaller sections.")
    model_id = _validate_model(model)
    prompt = (
        "Refurbish the user's writing for clarity, grammar, readability, and flow. "
        "Preserve its original meaning, facts, names, numbers, intent, and level of certainty. "
        "Do not invent details, add claims, or answer the text. Keep the user's language and voice. "
        "Return only the revised text, with no preamble or explanation.\n\n"
        "USER TEXT:\n" + original
    )
    response = _generate(model_id, prompt)
    return {"text": _candidate_text(response), "model": model_id}


def _utf16_to_python_index(text: str, position: int) -> int:
    """Convert Google/JavaScript UTF-16 offsets to Python code-point offsets."""
    units = 0
    for index, character in enumerate(text):
        if units >= position:
            return index
        units += 2 if ord(character) > 0xFFFF else 1
    return len(text)


def _with_grounding_citations(text: str, supports: Any, chunk_to_source: dict[int, int]) -> str:
    """Append source markers only where Google's grounding metadata supports them."""
    if not isinstance(supports, list) or not chunk_to_source:
        return text
    insertions: dict[int, set[int]] = {}
    for support in supports:
        if not isinstance(support, dict):
            continue
        segment = support.get("segment", {})
        if not isinstance(segment, dict):
            continue
        end = segment.get("endIndex")
        if not isinstance(end, int) or end < 0:
            continue
        indices = support.get("groundingChunkIndices", [])
        if not isinstance(indices, list):
            continue
        citations = {chunk_to_source[index] for index in indices if isinstance(index, int) and index in chunk_to_source}
        if citations:
            position = _utf16_to_python_index(text, end)
            insertions.setdefault(position, set()).update(citations)
    for position in sorted(insertions, reverse=True):
        markers = " " + "".join(f"[{index}]" for index in sorted(insertions[position]))
        text = text[:position] + markers + text[position:]
    return text


def _with_url_citations(text: str, annotations: Any, source_numbers: dict[str, int]) -> str:
    if not isinstance(annotations, list) or not source_numbers:
        return text
    insertions: dict[int, set[int]] = {}
    for annotation in annotations:
        if not isinstance(annotation, dict) or annotation.get("type") != "url_citation":
            continue
        url = str(annotation.get("url", "")).strip()
        end = annotation.get("end_index", annotation.get("endIndex"))
        if url not in source_numbers or not isinstance(end, int) or end < 0:
            continue
        insertions.setdefault(_utf16_to_python_index(text, end), set()).add(source_numbers[url])
    for position in sorted(insertions, reverse=True):
        markers = " " + "".join(f"[{number}]" for number in sorted(insertions[position]))
        text = text[:position] + markers + text[position:]
    return text


def search(query: str, model: str | None = None) -> dict[str, Any]:
    prompt = query.strip()
    if not prompt:
        raise GeminiError("Say or type what you want to search for.")
    if len(prompt) > 2_000:
        raise GeminiError("Keep a web search query under 2,000 characters.")
    model_id = _validate_model(model)
    interaction = _request("POST", "/interactions", _get_key(), {
        "model": model_id,
        "input": prompt,
        "tools": [{"type": "google_search"}],
        "store": False,
    })
    response_status = str(interaction.get("status", "completed"))
    if response_status not in ("completed", "succeeded"):
        response_error = interaction.get("error", {})
        message = response_error.get("message") if isinstance(response_error, dict) else None
        raise GeminiError(f"Gemini search did not complete (status: {response_status}). {str(message or '')[:240]}".strip())
    steps = interaction.get("steps", [])
    if not isinstance(steps, list):
        raise GeminiError("Google returned an unexpected search response (missing result steps).")

    sources: list[dict[str, str]] = []
    source_numbers: dict[str, int] = {}
    text_parts: list[str] = []
    queries: list[str] = []
    suggestion_html: list[str] = []
    for step in steps:
        if not isinstance(step, dict):
            continue
        step_type = step.get("type")
        if step_type == "google_search_call":
            arguments = step.get("arguments", {})
            search_queries = arguments.get("queries", []) if isinstance(arguments, dict) else []
            if isinstance(search_queries, list):
                queries.extend(str(item) for item in search_queries if str(item).strip())
        elif step_type == "google_search_result":
            results = step.get("result", [])
            if isinstance(results, list):
                for item in results:
                    if isinstance(item, dict):
                        html = item.get("search_suggestions", item.get("searchSuggestions"))
                        if isinstance(html, str) and html.strip():
                            suggestion_html.append(html)
        elif step_type == "model_output":
            blocks = step.get("content", [])
            if not isinstance(blocks, list):
                continue
            for block in blocks:
                if not isinstance(block, dict) or block.get("type") != "text":
                    continue
                block_text = str(block.get("text", "")).strip()
                if not block_text:
                    continue
                annotations = block.get("annotations", [])
                if isinstance(annotations, list):
                    for annotation in annotations:
                        if not isinstance(annotation, dict) or annotation.get("type") != "url_citation":
                            continue
                        uri = str(annotation.get("url", "")).strip()
                        if not uri.startswith("https://"):
                            continue
                        if uri not in source_numbers:
                            source_numbers[uri] = len(sources) + 1
                            sources.append({"title": str(annotation.get("title", "")).strip() or uri, "uri": uri})
                text_parts.append(_with_url_citations(block_text, annotations, source_numbers))

    answer = "\n\n".join(text_parts).strip()
    if not answer:
        answer = str(interaction.get("output_text", "")).strip()
    if not answer:
        raise GeminiError("Gemini returned no text for this search. Try again or choose another stable model.")
    # Keep the result view compact and avoid duplicate query labels/suggestion widgets.
    unique_queries = list(dict.fromkeys(queries))
    unique_suggestions = list(dict.fromkeys(suggestion_html))
    return {
        "text": answer,
        "model": model_id,
        "sources": sources,
        "queries": unique_queries,
        "search_entry_point": "\n".join(unique_suggestions) if unique_suggestions else None,
    }

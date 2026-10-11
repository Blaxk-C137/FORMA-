"""Optional Gemini Developer API integration.

Secrets are kept out of browser storage. On Windows, Python keyring uses the
Windows Credential Manager; on other desktops it uses the configured OS key
store. An environment variable is supported for managed installs/tests.
"""
from __future__ import annotations

import json
import os
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
        try:
            error_data = json.loads(exc.read().decode("utf-8", "replace"))
            message = str(error_data.get("error", {}).get("message", ""))
        except Exception:  # noqa: BLE001
            message = ""
        if exc.code in (401, 403):
            raise GeminiError("Google rejected this API key or the project does not have access to this Gemini feature. Check the key and billing/tier in Google AI Studio.") from exc
        if exc.code == 429:
            raise GeminiError("Gemini quota or rate limit reached. Check the project's limits and billing in Google AI Studio.") from exc
        if message:
            raise GeminiError(f"Gemini API error ({exc.code}): {message[:500]}") from exc
        raise GeminiError(f"Gemini API request failed with HTTP {exc.code}.") from exc
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


def _generate(model: str, prompt: str, *, search: bool = False) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "contents": [{"parts": [{"text": prompt}]}],
        # Gemini 3 docs recommend leaving temperature at its default of 1.0.
        # A generous output cap avoids truncating longer transcript refurbishments.
        "generationConfig": {"maxOutputTokens": 32768},
    }
    if search:
        payload["tools"] = [{"google_search": {}}]
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


def search(query: str, model: str | None = None) -> dict[str, Any]:
    prompt = query.strip()
    if not prompt:
        raise GeminiError("Say or type what you want to search for.")
    if len(prompt) > 2_000:
        raise GeminiError("Keep a web search query under 2,000 characters.")
    model_id = _validate_model(model)
    response = _generate(model_id, prompt, search=True)
    candidate = response.get("candidates", [{}])[0]
    metadata = candidate.get("groundingMetadata", {}) if isinstance(candidate, dict) else {}
    chunks = metadata.get("groundingChunks", []) if isinstance(metadata, dict) else []
    sources: list[dict[str, str]] = []
    seen: dict[str, int] = {}
    chunk_to_source: dict[int, int] = {}
    if isinstance(chunks, list):
        for chunk_index, chunk in enumerate(chunks):
            web = chunk.get("web", {}) if isinstance(chunk, dict) else {}
            uri = str(web.get("uri", "")).strip() if isinstance(web, dict) else ""
            title = str(web.get("title", "")).strip() if isinstance(web, dict) else ""
            if uri.startswith("https://"):
                if uri not in seen:
                    seen[uri] = len(sources) + 1
                    sources.append({"title": title or uri, "uri": uri})
                chunk_to_source[chunk_index] = seen[uri]
    supports = metadata.get("groundingSupports", []) if isinstance(metadata, dict) else []
    text = _with_grounding_citations(_candidate_text(response), supports, chunk_to_source)
    queries = metadata.get("webSearchQueries", []) if isinstance(metadata, dict) else []
    entry = metadata.get("searchEntryPoint", {}) if isinstance(metadata, dict) else {}
    entry_html = entry.get("renderedContent") if isinstance(entry, dict) else None
    return {
        "text": text,
        "model": model_id,
        "sources": sources,
        "queries": [str(item) for item in queries] if isinstance(queries, list) else [],
        "search_entry_point": entry_html if isinstance(entry_html, str) else None,
    }

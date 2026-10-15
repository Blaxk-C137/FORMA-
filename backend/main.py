"""Forma local speech backend — Whisper Tiny + Piper + opt-in Gemini tools.

Run directly:            python main.py
Or via uvicorn:          uvicorn main:app --host 127.0.0.1 --port 8787
The frontend dev server starts and proxies to this automatically.
"""
from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from gemini import CredentialVaultUnavailable, GeminiApiError, GeminiError, get_settings as gemini_settings
from gemini import refurbish as gemini_refurbish
from gemini import remove_key as remove_gemini_key
from gemini import save_key as save_gemini_key
from gemini import summarize_search_results as gemini_summarize_search_results
from tavily_search import TavilySearchApiError, TavilySearchError, search as tavily_search
from stt import stt
from tts import DEFAULT_VOICE, tts

@asynccontextmanager
async def lifespan(_: FastAPI):
    if stt.available:
        stt.warm_up()
    if tts.available:
        tts.warm_up()
    yield


app = FastAPI(title="Forma local voice backend", lifespan=lifespan)
# Browser traffic goes through the same-origin Vite proxy. Keep CORS disabled on
# this loopback-only service, especially for its secret-bearing Gemini routes.


def _gemini_error(exc: GeminiError) -> JSONResponse:
    if isinstance(exc, GeminiApiError):
        return JSONResponse({
            "detail": str(exc),
            "upstream_status": exc.status_code,
            "google_status": exc.google_status,
            "google_code": exc.google_code,
            "retry_after_seconds": exc.retry_after,
            "quota_metrics": exc.quota_metrics,
        }, status_code=exc.status_code)
    code = 503 if isinstance(exc, CredentialVaultUnavailable) else 400
    return JSONResponse({"detail": str(exc)}, status_code=code)


def _tavily_error(exc: TavilySearchError) -> JSONResponse:
    if isinstance(exc, TavilySearchApiError):
        return JSONResponse({
            "detail": str(exc),
            "upstream_status": exc.status_code,
            "retry_after_seconds": exc.retry_after,
        }, status_code=exc.status_code)
    return JSONResponse({"detail": str(exc)}, status_code=503 if "reach Tavily" in str(exc) else 400)


@app.get("/api/status")
def status():
    return {
        "stt_ready": stt.available,
        "tts_ready": tts.available,
        "stt_model": stt.model_name,
        "tts_model": tts.model_name,
        "stt_loaded": stt.loaded,
        "tts_loaded": tts.loaded,
        **({"stt_error": stt.error} if stt.error else {}),
        **({"tts_error": tts.error} if tts.error else {}),
    }


@app.post("/api/transcribe")
async def transcribe(audio: UploadFile = File(...), language: str = Form("auto")):
    started = time.perf_counter()
    wav_bytes = await audio.read()
    if not wav_bytes:
        return JSONResponse({"detail": "Empty audio upload."}, status_code=400)
    try:
        text = stt.transcribe(wav_bytes, language=language)
    except Exception as exc:  # noqa: BLE001
        return JSONResponse({"detail": f"Transcription failed: {exc}"}, status_code=500)
    return {
        "text": text,
        "language": language,
        "duration_ms": int((time.perf_counter() - started) * 1000),
    }


@app.post("/api/synthesize")
async def synthesize(payload: dict):
    text = str(payload.get("text", ""))
    if not text.strip():
        return JSONResponse({"detail": "Text is required."}, status_code=400)
    voice = str(payload.get("voice") or DEFAULT_VOICE)
    try:
        length_scale = float(payload.get("length_scale") or 1.0)
    except (TypeError, ValueError):
        length_scale = 1.0
    try:
        wav = tts.synthesize(text, voice_id=voice, length_scale=length_scale)
    except Exception as exc:  # noqa: BLE001
        return JSONResponse({"detail": f"Speech synthesis failed: {exc}"}, status_code=500)
    return Response(wav, media_type="audio/wav")


@app.get("/api/gemini/settings")
def get_gemini_settings():
    return gemini_settings()


@app.post("/api/gemini/key")
def put_gemini_key(payload: dict):
    try:
        return save_gemini_key(str(payload.get("api_key", "")))
    except GeminiError as exc:
        return _gemini_error(exc)


@app.delete("/api/gemini/key")
def delete_gemini_key():
    try:
        return remove_gemini_key()
    except GeminiError as exc:
        return _gemini_error(exc)


@app.post("/api/gemini/refurbish")
def refurbish_text(payload: dict):
    try:
        return gemini_refurbish(str(payload.get("text", "")), str(payload.get("model", "")))
    except GeminiError as exc:
        return _gemini_error(exc)


@app.post("/api/gemini/summarize-search")
def summarize_tavily_results(payload: dict):
    try:
        return gemini_summarize_search_results(
            str(payload.get("query", "")),
            payload.get("results", []),
            str(payload.get("model", "")),
        )
    except GeminiError as exc:
        return _gemini_error(exc)


@app.post("/api/tavily/search")
def tavily_web_search(payload: dict):
    try:
        return tavily_search(str(payload.get("query", "")))
    except TavilySearchError as exc:
        return _tavily_error(exc)


# Production Docker deployments serve the Vite build from this same origin so
# browser requests to /api/* stay same-origin. Local development still uses Vite.
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("FORMA_ML_HOST", "127.0.0.1"),
        port=int(os.environ.get("FORMA_ML_PORT", "8787")),
        log_level="warning",
    )

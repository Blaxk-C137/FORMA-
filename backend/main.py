"""Forma local speech backend — Whisper Tiny + Piper + opt-in Gemini tools.

Run directly:            python main.py
Or via uvicorn:          uvicorn main:app --host 127.0.0.1 --port 8787
The frontend dev server starts and proxies to this automatically.
"""
from __future__ import annotations

import os
import time

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse, Response

from gemini import CredentialVaultUnavailable, GeminiError, get_settings as gemini_settings
from gemini import refurbish as gemini_refurbish
from gemini import remove_key as remove_gemini_key
from gemini import save_key as save_gemini_key
from gemini import search as gemini_search
from stt import stt
from tts import DEFAULT_VOICE, tts

app = FastAPI(title="Forma local voice backend")
# Browser traffic goes through the same-origin Vite proxy. Keep CORS disabled on
# this loopback-only service, especially for its secret-bearing Gemini routes.


def _gemini_error(exc: GeminiError) -> JSONResponse:
    code = 503 if isinstance(exc, CredentialVaultUnavailable) else 400
    return JSONResponse({"detail": str(exc)}, status_code=code)


@app.on_event("startup")
def _warm() -> None:
    if stt.available:
        stt.warm_up()
    if tts.available:
        tts.warm_up()


@app.get("/api/status")
def status():
    return {
        "stt_ready": stt.available,
        "tts_ready": tts.available,
        "stt_model": stt.model_name,
        "tts_model": tts.model_name,
        "stub": False,
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
        "stub": False,
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


@app.post("/api/gemini/search")
def voice_web_search(payload: dict):
    try:
        return gemini_search(str(payload.get("query", "")), str(payload.get("model", "")))
    except GeminiError as exc:
        return _gemini_error(exc)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("FORMA_ML_HOST", "127.0.0.1"),
        port=int(os.environ.get("FORMA_ML_PORT", "8787")),
        log_level="warning",
    )

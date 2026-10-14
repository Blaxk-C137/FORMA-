"""Strict offline smoke check for the installed local Whisper + Piper stack.

Run from the project's provisioned backend virtual environment. This test loads
both local Piper voices and local Whisper Tiny, then exercises the real FastAPI
synthesize/transcribe routes. It makes no cloud requests and reports no WER.
"""
from __future__ import annotations

import importlib.metadata
import io
import sys
import wave
from pathlib import Path


def log(message: str) -> None:
    print(f"[forma:verify] {message}", flush=True)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def main() -> None:
    log("1/6 Checking supported Python version…")
    version = sys.version_info
    require(
        version.major == 3 and version.minor in (10, 11, 12),
        f"Python {version.major}.{version.minor} is not supported. Use Python 3.10, 3.11, or 3.12, then recreate backend/.venv.",
    )
    log(f"Python {version.major}.{version.minor}.{version.micro} OK ({sys.executable})")

    log("2/6 Importing installed ML/backend packages…")
    import numpy as np
    import torch
    import transformers
    import fastapi
    import uvicorn
    import httpx
    import httpx2
    import keyring
    from piper import PiperVoice
    from fastapi.testclient import TestClient

    packages = ("numpy", "torch", "transformers", "piper-tts", "fastapi", "uvicorn", "httpx", "httpx2", "keyring")
    for package in packages:
        try:
            package_version = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            package_version = "imported (version metadata unavailable)"
        log(f"{package} {package_version} OK")
    require(all(module is not None for module in (np, torch, transformers, fastapi, uvicorn, httpx, httpx2, keyring, PiperVoice, TestClient)),
            "One or more required Python imports returned no module.")

    log("3/6 Checking local model files…")
    import stt
    import tts

    whisper_dir = Path(stt.MODEL_DIR)
    require((whisper_dir / "config.json").is_file(), f"Whisper config is missing: {whisper_dir / 'config.json'}")
    require((whisper_dir / "model.safetensors").is_file(), f"Whisper weights are missing: {whisper_dir / 'model.safetensors'}")
    for voice_id, model_name in tts.VOICES.items():
        onnx_path = Path(tts.MODELS_DIR) / f"{model_name}.onnx"
        config_path = Path(tts.MODELS_DIR) / f"{model_name}.onnx.json"
        require(onnx_path.is_file(), f"Piper voice weights are missing: {onnx_path}")
        require(config_path.is_file(), f"Piper voice config is missing: {config_path}")
        log(f"Piper {voice_id}: {onnx_path.name} + .onnx.json OK")
    log(f"Whisper Tiny files OK: {whisper_dir}")

    log("4/6 Running Piper inference for every bundled voice…")
    generated: dict[str, bytes] = {}
    for voice_id in tts.VOICES:
        audio = tts.tts.synthesize("Local speech installation check.", voice_id=voice_id, length_scale=1.0)
        with wave.open(io.BytesIO(audio), "rb") as wav:
            require(wav.getnframes() > 0, f"Piper {voice_id} returned an empty WAV.")
            require(wav.getframerate() > 0, f"Piper {voice_id} returned an invalid sample rate.")
            require(wav.getnchannels() > 0, f"Piper {voice_id} returned an invalid channel count.")
        generated[voice_id] = audio
        log(f"Piper {voice_id} inference OK ({len(audio)} WAV bytes)")

    log("5/6 Loading Whisper Tiny locally…")
    stt.stt._load_sync()
    require(stt.stt._pipe is not None, f"Whisper failed to load: {stt.stt.error or 'unknown model-loading error'}")
    log("Whisper model load OK")

    log("6/6 Exercising the real local FastAPI status, synthesis, and transcription routes…")
    import main

    route_paths = {getattr(route, "path", None) for route in main.app.routes}
    for required_route in ("/api/status", "/api/synthesize", "/api/transcribe"):
        require(required_route in route_paths, f"Required local API route is missing: {required_route}")

    with TestClient(main.app) as client:
        status_response = client.get("/api/status")
        require(status_response.status_code == 200, f"/api/status returned HTTP {status_response.status_code}")
        status = status_response.json()
        require(status.get("stt_ready") is True, "/api/status reports Whisper is not ready")
        require(status.get("tts_ready") is True, "/api/status reports Piper is not ready")

        synthesis = client.post("/api/synthesize", json={
            "text": "Local speech endpoint check.",
            "voice": "lessac",
            "length_scale": 1.0,
        })
        require(synthesis.status_code == 200, f"/api/synthesize returned HTTP {synthesis.status_code}: {synthesis.text[:240]}")
        require(synthesis.headers.get("content-type", "").startswith("audio/wav"), "/api/synthesize did not return audio/wav")
        require(synthesis.content.startswith(b"RIFF"), "/api/synthesize returned an invalid WAV payload")
        log(f"/api/synthesize OK ({len(synthesis.content)} WAV bytes)")

        transcription = client.post(
            "/api/transcribe",
            files={"audio": ("local-check.wav", synthesis.content, "audio/wav")},
            data={"language": "auto"},
        )
        require(transcription.status_code == 200, f"/api/transcribe returned HTTP {transcription.status_code}: {transcription.text[:240]}")
        result = transcription.json()
        require(isinstance(result.get("text"), str), "/api/transcribe did not return a text field")
        log(f"/api/transcribe OK (returned {len(result['text'])} characters; no accuracy score is computed)")

    log("PASS — Python dependencies, model assets, both Piper voices, Whisper inference, and local API routes are configured.")
    log("No cloud speech services were contacted.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - this is a user-facing installation check
        log(f"FAIL — {type(exc).__name__}: {exc}")
        log("Run `npm run setup:ml` after correcting the reported Python, package, model, or disk-space issue.")
        sys.exit(1)

"""Whisper Tiny speech-to-text service (local, multilingual)."""
from __future__ import annotations

import io
import os
import threading
import time
import wave

import numpy as np

MODEL_DIR = os.environ.get(
    "FORMA_STT_MODEL",
    os.path.expanduser(os.path.join("~", ".cache", "forma", "models", "whisper-tiny")),
)
TARGET_SR = 16000

# UI language codes -> Whisper language names (unsupported ones fall back to auto)
LANGUAGES = {
    "en": "english",
    "fr": "french",
    "es": "spanish",
    "pt": "portuguese",
    "ar": "arabic",
    "de": "german",
    "zh": "chinese",
    "hi": "hindi",
}


class SttService:
    def __init__(self) -> None:
        self._pipe = None
        self._error: str | None = None
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        return os.path.isdir(MODEL_DIR) and os.path.exists(os.path.join(MODEL_DIR, "config.json"))

    @property
    def loaded(self) -> bool:
        return self._pipe is not None

    @property
    def error(self) -> str | None:
        return self._error

    @property
    def model_name(self) -> str:
        return os.environ.get("FORMA_STT_NAME", "openai/whisper-tiny")

    def warm_up(self) -> None:
        """Load the model in the background so the first request is fast."""
        threading.Thread(target=self._load, daemon=True).start()

    def _load(self) -> None:
        with self._lock:
            if self._pipe is not None:
                return
            try:
                from transformers import pipeline

                self._pipe = pipeline(
                    "automatic-speech-recognition",
                    model=MODEL_DIR,
                    device=-1,
                    chunk_length_s=30,
                )
                self._error = None
            except Exception as exc:  # noqa: BLE001 - surface any load failure in /api/status
                self._error = f"{type(exc).__name__}: {exc}"

    def _load_sync(self) -> None:
        self._load()

    @staticmethod
    def wav_to_16k_mono(wav_bytes: bytes) -> np.ndarray:
        with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
            sr = wf.getframerate()
            n = wf.getnframes()
            channels = wf.getnchannels()
            width = wf.getsampwidth()
            raw = wf.readframes(n)
        if width == 2:
            data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
        elif width == 4:
            data = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0
        elif width == 1:
            data = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
        else:
            raise ValueError(f"unsupported WAV sample width: {width}")
        if channels > 1:
            data = data.reshape(-1, channels).mean(axis=1)
        if sr != TARGET_SR:
            duration = data.shape[0] / sr
            target_len = max(1, int(duration * TARGET_SR))
            x_old = np.linspace(0.0, 1.0, num=data.shape[0], endpoint=False)
            x_new = np.linspace(0.0, 1.0, num=target_len, endpoint=False)
            data = np.interp(x_new, x_old, data).astype(np.float32)
        return data

    def transcribe(self, wav_bytes: bytes, language: str = "auto") -> str:
        if self._pipe is None:
            self._load_sync()
        if self._pipe is None:
            raise RuntimeError(self._error or "Whisper model is not loaded")
        audio = self.wav_to_16k_mono(wav_bytes)
        if audio.size == 0:
            return ""
        gen: dict = {}
        if language in LANGUAGES:
            gen = {"language": LANGUAGES[language], "task": "transcribe"}
        t0 = time.perf_counter()
        result = self._pipe(audio, generate_kwargs=gen) if gen else self._pipe(audio)
        _ = t0
        return str(result.get("text", "")).strip()


stt = SttService()

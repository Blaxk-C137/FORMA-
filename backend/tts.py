"""Piper neural text-to-speech service (local)."""
from __future__ import annotations

import io
import os
import threading
import wave

MODELS_ROOT = os.path.expanduser(
    os.environ.get("FORMA_MODELS_DIR", os.path.join("~", ".cache", "forma", "models"))
)
MODELS_DIR = os.path.expanduser(os.environ.get("FORMA_TTS_DIR", MODELS_ROOT))

# UI voice ids -> Piper voice model names (files: <name>.onnx + <name>.onnx.json)
VOICES = {
    "lessac": "en_US-lessac-medium",
    "alba": "en_GB-alba-medium",
}
DEFAULT_VOICE = "lessac"


class TtsService:
    def __init__(self) -> None:
        self._voices: dict[str, object] = {}
        self._lock = threading.Lock()
        self._error: str | None = None

    def voice_path(self, voice_id: str) -> str | None:
        name = VOICES.get(voice_id, VOICES[DEFAULT_VOICE])
        path = os.path.join(MODELS_DIR, f"{name}.onnx")
        return path if os.path.exists(path) else None

    @property
    def available(self) -> bool:
        return any(self.voice_path(v) for v in VOICES)

    @property
    def loaded(self) -> bool:
        return bool(self._voices)

    @property
    def error(self) -> str | None:
        return self._error

    @property
    def model_name(self) -> str:
        name = VOICES.get(DEFAULT_VOICE)
        return os.environ.get("FORMA_TTS_NAME", f"piper/{name}")

    def warm_up(self) -> None:
        threading.Thread(target=lambda: self._get_voice(DEFAULT_VOICE), daemon=True).start()

    def _get_voice(self, voice_id: str):
        with self._lock:
            if voice_id in self._voices:
                return self._voices[voice_id]
            path = self.voice_path(voice_id)
            if path is None:
                raise RuntimeError(
                    f"Piper voice '{VOICES.get(voice_id, voice_id)}' not found in {MODELS_DIR}. "
                    "Run: python download_models.py"
                )
            try:
                from piper import PiperVoice

                voice = PiperVoice.load(path)
                self._voices[voice_id] = voice
                self._error = None
                return voice
            except Exception as exc:  # noqa: BLE001
                self._error = f"{type(exc).__name__}: {exc}"
                raise

    def synthesize(self, text: str, voice_id: str = DEFAULT_VOICE, length_scale: float = 1.0) -> bytes:
        voice = self._get_voice(voice_id)
        from piper import SynthesisConfig

        config = SynthesisConfig(length_scale=max(0.4, min(2.2, float(length_scale or 1.0))))
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wf:
            voice.synthesize_wav(text, wf, syn_config=config)
        return buffer.getvalue()


tts = TtsService()

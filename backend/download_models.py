"""Download the local Whisper Tiny + Piper models into their configured paths.

Default paths live under ~/.cache/forma/models. Set FORMA_MODELS_DIR to move the
shared model root, FORMA_STT_MODEL to override Whisper's directory, or
FORMA_TTS_DIR to override the Piper voice directory. Run once after installing
requirements: python download_models.py.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

MODELS_ROOT = Path(os.path.expanduser(
    os.environ.get("FORMA_MODELS_DIR", os.path.join("~", ".cache", "forma", "models"))
)).resolve()
STT_DIR = Path(os.path.expanduser(
    os.environ.get("FORMA_STT_MODEL", str(MODELS_ROOT / "whisper-tiny"))
)).resolve()
TTS_DIR = Path(os.path.expanduser(
    os.environ.get("FORMA_TTS_DIR", str(MODELS_ROOT))
)).resolve()
VOICES = ["en_US-lessac-medium", "en_GB-alba-medium"]


def whisper_ready() -> bool:
    return (STT_DIR / "config.json").is_file() and (STT_DIR / "model.safetensors").is_file()


def voice_ready(name: str) -> bool:
    return (TTS_DIR / f"{name}.onnx").is_file() and (TTS_DIR / f"{name}.onnx.json").is_file()


def main() -> None:
    STT_DIR.mkdir(parents=True, exist_ok=True)
    TTS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[forma:models] Whisper directory: {STT_DIR}", flush=True)
    print(f"[forma:models] Piper directory: {TTS_DIR}", flush=True)

    if whisper_ready():
        print("[forma:models] Whisper Tiny weights and config already present", flush=True)
    else:
        print("[forma:models] Downloading openai/whisper-tiny (safetensors only)…", flush=True)
        from huggingface_hub import snapshot_download

        snapshot_download(
            "openai/whisper-tiny",
            local_dir=str(STT_DIR),
            ignore_patterns=["*.bin", "*.h5", "*.msgpack"],
        )
        if not whisper_ready():
            raise RuntimeError(
                f"Whisper download completed, but config.json/model.safetensors are missing from {STT_DIR}. "
                "Check the Hugging Face download log and disk space."
            )
        print("[forma:models] Whisper Tiny verified", flush=True)

    for voice in VOICES:
        if voice_ready(voice):
            print(f"[forma:models] Piper voice {voice} already present", flush=True)
            continue
        print(f"[forma:models] Downloading Piper voice {voice}…", flush=True)
        subprocess.check_call(
            [sys.executable, "-m", "piper.download_voices", voice],
            cwd=str(TTS_DIR),
        )
        if not voice_ready(voice):
            raise RuntimeError(
                f"Piper download completed, but {voice}.onnx and its .onnx.json config are not both present in {TTS_DIR}."
            )
        print(f"[forma:models] Piper voice {voice} verified", flush=True)

    print("[forma:models] All required local speech models are present.", flush=True)


if __name__ == "__main__":
    main()

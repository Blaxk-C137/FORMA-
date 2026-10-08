"""Download the local models: Whisper Tiny + Piper voices.

Weights live in FORMA_MODELS_DIR (default ~/.cache/forma/models) — cache, not
source. Run once after installing requirements:  python download_models.py
"""
from __future__ import annotations

import os
import subprocess
import sys

MODELS = os.path.expanduser(
    os.environ.get("FORMA_MODELS_DIR", os.path.join("~", ".cache", "forma", "models"))
)
VOICES = ["en_US-lessac-medium", "en_GB-alba-medium"]


def main() -> None:
    os.makedirs(MODELS, exist_ok=True)

    if os.path.exists(os.path.join(MODELS, "whisper-tiny", "config.json")):
        print("  whisper-tiny already present")
    else:
        print("→ downloading openai/whisper-tiny (safetensors only) …")
        from huggingface_hub import snapshot_download

        snapshot_download(
            "openai/whisper-tiny",
            local_dir=os.path.join(MODELS, "whisper-tiny"),
            # one weights format only — .bin would duplicate model.safetensors (~150 MB)
            ignore_patterns=["*.bin", "*.h5", "*.msgpack"],
        )
        print("  whisper-tiny ready")

    for voice in VOICES:
        if os.path.exists(os.path.join(MODELS, f"{voice}.onnx")):
            print(f"  {voice} already present")
            continue
        print(f"→ downloading piper voice {voice} …")
        subprocess.check_call(
            [sys.executable, "-m", "piper.download_voices", voice],
            cwd=MODELS,
        )
    print("  piper voices ready")

    listing = sorted(os.listdir(MODELS))
    print(f"\ndone. models dir now contains: {', '.join(listing)}")


if __name__ == "__main__":
    main()

#!/usr/bin/env bash
# One-time ML setup: venv + Python deps + model downloads.
# After this, `npm run dev` runs everything (frontend + real backend).
set -e
cd "$(dirname "$0")/../backend"
PYTHON="${FORMA_PYTHON:-python3}"
echo "→ creating backend/.venv with $PYTHON"
"$PYTHON" -m venv .venv
P=.venv/bin/pip
echo "→ installing torch (CPU)"
"$P" install --quiet torch --index-url https://download.pytorch.org/whl/cpu
echo "→ installing backend requirements"
"$P" install --quiet -r requirements.txt
echo "→ downloading models (whisper-tiny + piper voices)"
.venv/bin/python download_models.py
echo ""
echo "ML setup complete. Run: npm run dev"

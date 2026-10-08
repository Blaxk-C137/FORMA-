#!/usr/bin/env bash
# One-command preview start: installs deps if the sandbox cleared them,
# then serves the Forma studio on http://localhost:5173
set -e
cd "$(dirname "$0")/../frontend"
if [ ! -x node_modules/.bin/vite ]; then
  echo "→ restoring node_modules…"
  npm install --no-audit --no-fund
fi
exec npm run dev

# One-time ML setup (Windows): venv + Python deps + model downloads.
# After this, `npm run dev` runs everything (frontend + real backend).
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\backend")
$py = if ($env:FORMA_PYTHON) { $env:FORMA_PYTHON } else { "py" }
Write-Host "→ creating backend\.venv with $py"
& $py -m venv .venv
$pip = ".\.venv\Scripts\pip.exe"
Write-Host "→ installing torch (CPU)"
& $pip install --quiet torch --index-url https://download.pytorch.org/whl/cpu
Write-Host "→ installing backend requirements"
& $pip install --quiet -r requirements.txt
Write-Host "→ downloading models (whisper-tiny + piper voices)"
& .\.venv\Scripts\python.exe download_models.py
Write-Host ""
Write-Host "ML setup complete. Run: npm run dev"

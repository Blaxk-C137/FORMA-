#!/usr/bin/env node
/** Verify provisioned speech dependencies with an offline local inference smoke test. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const backendDir = path.resolve(frontendDir, "..", "backend");
const python = process.platform === "win32"
  ? path.join(backendDir, ".venv", "Scripts", "python.exe")
  : path.join(backendDir, ".venv", "bin", "python");

function fail(message) {
  console.error(`[forma:verify] ERROR: ${message}`);
  console.error("[forma:verify] Run npm run setup:ml to provision the local ML backend.");
  process.exitCode = 1;
}

if (!fs.existsSync(python)) {
  fail(`Backend Python environment is missing: ${python}`);
} else if (!fs.existsSync(path.join(backendDir, "verify_ml.py"))) {
  fail(`Offline ML verification script is missing: ${path.join(backendDir, "verify_ml.py")}`);
} else {
  console.log("[forma:verify] Starting strict offline Whisper + Piper inference check.");
  console.log("[forma:verify] Hugging Face offline mode is enabled; this check makes no network requests.");
  const result = spawnSync(python, ["verify_ml.py"], {
    cwd: backendDir,
    env: {
      ...process.env,
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
      HF_HUB_DISABLE_TELEMETRY: "1",
    },
    stdio: "inherit",
    windowsHide: true,
    timeout: 10 * 60 * 1000,
  });
  if (result.error) fail(`Could not launch local ML verification: ${result.error.message}`);
  else if (result.signal) fail(`Local ML verification was terminated by ${result.signal}.`);
  else if (result.status !== 0) fail(`Local ML verification failed with exit code ${result.status}. See the step-by-step output above.`);
  else console.log("[forma:verify] PASS — all required local ML components are installed and usable.");
}

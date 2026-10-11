#!/usr/bin/env node
/**
 * Bakes the ML backend into `npm install` (postinstall) — cross-platform.
 *
 *   - creates backend/.venv (Python 3.10–3.12)
 *   - installs torch (CPU) + FastAPI + transformers + piper
 *   - downloads whisper-tiny + Piper voices into backend/models/
 *
 * Idempotent: already-provisioned machines no-op in milliseconds.
 * Never breaks `npm install`: failures print loud warnings and leave the app
 * in honest DUMMY MODE. Retry any time with:  npm run setup:ml
 * Skip entirely with:  FORMA_SKIP_ML=1 npm install
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const backendDir = path.resolve(frontendDir, "..", "backend");
const modelsDir = process.env.FORMA_MODELS_DIR || path.join(os.homedir(), ".cache", "forma", "models");
const soft = process.env.npm_lifecycle_event === "postinstall";

const say = (m) => console.log(`[forma] ${m}`);
const warn = (m) => console.warn(`[forma] ${m}`);

function fail(m) {
  warn(m);
  if (soft) {
    warn("The app will run in DUMMY MODE until this is fixed. Retry with: npm run setup:ml");
    process.exit(0);
  }
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) fail(`command failed: ${cmd} ${args.join(" ")}`);
  return r;
}

if (process.env.FORMA_SKIP_ML === "1") {
  say("FORMA_SKIP_ML=1 — skipping ML backend setup (the app runs in DUMMY MODE).");
  process.exit(0);
}

if (!fs.existsSync(path.join(backendDir, "main.py"))) {
  say("no backend/ found — nothing to set up.");
  process.exit(0);
}

// find a Python
const probes =
  process.platform === "win32"
    ? [["py", ["-3"]], ["python", []]]
    : [["python3", []], ["python", []]];
let python = null;
let pyArgs = [];
for (const [cmd, args] of probes) {
  const r = spawnSync(cmd, [...args, "--version"], { encoding: "utf8" });
  if (r.status === 0) {
    python = cmd;
    pyArgs = args;
    break;
  }
}
if (!python) {
  warn("Python not found — the real ML backend needs Python 3.10–3.12.");
  warn("Install Python, then run: npm run setup:ml  (until then the app runs in DUMMY MODE).");
  process.exit(0);
}

const venvDir = path.join(backendDir, ".venv");
const venvPy =
  process.platform === "win32"
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");
const depMarker = path.join(venvDir, ".forma-deps-ok");

if (!fs.existsSync(venvPy)) {
  say(`creating Python venv with ${python} …`);
  run(python, [...pyArgs, "-m", "venv", ".venv"], { cwd: backendDir });
}

// Bump this marker when backend requirements change. Upgrade the small Python
// requirements set without needlessly redownloading torch on existing installs.
const depsVersion = "2";
const markerValue = fs.existsSync(depMarker) ? fs.readFileSync(depMarker, "utf8").trim() : "";
if (markerValue !== depsVersion) {
  say("checking/installing CPU torch + backend requirements (first run may take a few minutes) …");
  const torchCheck = spawnSync(venvPy, ["-c", "import torch"], { stdio: "ignore" });
  if (torchCheck.status !== 0) {
    run(venvPy, ["-m", "pip", "install", "--quiet", "torch", "--index-url", "https://download.pytorch.org/whl/cpu"], { cwd: backendDir });
  }
  run(venvPy, ["-m", "pip", "install", "--quiet", "-r", "requirements.txt"], { cwd: backendDir });
  fs.writeFileSync(depMarker, depsVersion);
}

const whisperReady = fs.existsSync(path.join(modelsDir, "whisper-tiny", "config.json"));
const voicesReady = fs.existsSync(path.join(modelsDir, "en_US-lessac-medium.onnx"));
if (!whisperReady || !voicesReady) {
  say("downloading models (whisper-tiny + Piper voices) …");
  run(venvPy, ["download_models.py"], { cwd: backendDir });
}

say("ML backend ready — `npm run dev` starts everything.");

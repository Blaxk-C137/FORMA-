#!/usr/bin/env node
/**
 * Strict, idempotent local ML provisioning for install and dev startup.
 *
 * This script creates backend/.venv, installs CPU dependencies, and downloads
 * every required local model. Any failed step exits nonzero; there is no dummy
 * speech fallback.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const backendDir = path.resolve(frontendDir, "..", "backend");
const expandPath = (value) => {
  const expanded = value.replace(/^~(?=$|[\\/])/, os.homedir());
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(backendDir, expanded);
};
const modelsDir = expandPath(process.env.FORMA_MODELS_DIR || path.join(os.homedir(), ".cache", "forma", "models"));
const whisperDir = expandPath(process.env.FORMA_STT_MODEL || path.join(modelsDir, "whisper-tiny"));
const piperDir = expandPath(process.env.FORMA_TTS_DIR || modelsDir);
const venvDir = path.join(backendDir, ".venv");
const venvPy = process.platform === "win32"
  ? path.join(venvDir, "Scripts", "python.exe")
  : path.join(venvDir, "bin", "python");
const requirementsPath = path.join(backendDir, "requirements.txt");
const dependencyMarker = path.join(venvDir, ".forma-deps-ok");
const supportedMinors = new Set([10, 11, 12]);
const piperVoices = ["en_US-lessac-medium", "en_GB-alba-medium"];

const log = (message) => console.log(`[forma:ml] ${message}`);
const errorLog = (message) => console.error(`[forma:ml] ERROR: ${message}`);
const pythonVersionCode = "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')";

function commandLabel(command, args) {
  return [command, ...args].join(" ");
}

function runStep(label, command, args, options = {}) {
  log(`${label}…`);
  log(`$ ${commandLabel(command, args)}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? backendDir,
    env: options.env ?? process.env,
    stdio: "inherit",
    windowsHide: true,
    timeout: options.timeout ?? 30 * 60 * 1000,
  });
  if (result.error) throw new Error(`${label} could not start (${command}): ${result.error.message}`);
  if (result.signal) throw new Error(`${label} was terminated by ${result.signal}.`);
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}. Review the command output above.`);
  log(`${label}: OK`);
}

function probe(command, args) {
  const result = spawnSync(command, [...args, "-c", pythonVersionCode], {
    cwd: backendDir,
    encoding: "utf8",
    windowsHide: true,
    timeout: 15_000,
  });
  if (result.error) return { unavailable: result.error.message };
  const version = (result.stdout || "").trim().split(/\r?\n/).at(-1) || "";
  const supported = /^3\.(10|11|12)\./.test(version);
  return { status: result.status === 0 && supported ? 0 : 3, version, output: `${result.stdout || ""}${result.stderr || ""}`.trim() };
}

function choosePython() {
  const candidates = process.platform === "win32"
    ? [
        ["py", ["-3.12"]], ["py", ["-3.11"]], ["py", ["-3.10"]],
        ["python", []], ["python3", []],
      ]
    : [
        ["python3.12", []], ["python3.11", []], ["python3.10", []],
        ["python3", []], ["python", []],
      ];
  const detected = [];
  for (const [command, args] of candidates) {
    const result = probe(command, args);
    if (result.status === 0) return { command, args, version: result.version };
    if (result.version) detected.push(`${command} ${args.join(" ")}: Python ${result.version} (unsupported)`);
  }
  const found = detected.length ? ` Detected: ${detected.join("; ")}.` : " No supported Python interpreter was found.";
  throw new Error(`Forma requires Python 3.10, 3.11, or 3.12 for its local ML backend.${found} Install a supported 64-bit Python and rerun npm install or npm run setup:ml.`);
}

function venvVersion() {
  if (!fs.existsSync(venvPy)) return null;
  const result = spawnSync(venvPy, ["-c", pythonVersionCode], {
    cwd: backendDir,
    encoding: "utf8",
    windowsHide: true,
    timeout: 15_000,
  });
  if (result.error) return null;
  return (result.stdout || "").trim().split(/\r?\n/).at(-1) || null;
}

function markerFor(version) {
  const digest = createHash("sha256").update(fs.readFileSync(requirementsPath)).digest("hex").slice(0, 16);
  return `4|python=${version}|platform=${process.platform}-${process.arch}|requirements=${digest}`;
}

function checkImports() {
  return spawnSync(venvPy, ["-c", "import torch, numpy, transformers, piper, fastapi, uvicorn, keyring, httpx, httpx2, multipart"], {
    cwd: backendDir,
    stdio: "ignore",
    windowsHide: true,
    timeout: 30_000,
  });
}

function whisperFilesReady() {
  return fs.existsSync(path.join(whisperDir, "config.json")) && fs.existsSync(path.join(whisperDir, "model.safetensors"));
}

function voiceFilesReady(name) {
  return fs.existsSync(path.join(piperDir, `${name}.onnx`)) && fs.existsSync(path.join(piperDir, `${name}.onnx.json`));
}

function main() {
  if (process.env.FORMA_SKIP_ML === "1") {
    throw new Error("FORMA_SKIP_ML is not supported: Forma dev requires the real local speech models; no dummy speech mode is available.");
  }
  if (!fs.existsSync(path.join(backendDir, "main.py"))) {
    throw new Error(`Local ML backend was not found at ${backendDir}. Run this command from frontend/ in the Forma project.`);
  }

  log("STEP 1/5 — locating a supported Python runtime");
  const selectedPython = choosePython();
  log(`Selected Python ${selectedPython.version} via ${commandLabel(selectedPython.command, selectedPython.args)}`);

  log("STEP 2/5 — creating or validating backend/.venv");
  let actualVersion = venvVersion();
  if (actualVersion && !supportedMinors.has(Number(actualVersion.split(".")[1]))) {
    log(`Existing venv uses unsupported Python ${actualVersion}; recreating it with Python ${selectedPython.version}.`);
    fs.rmSync(venvDir, { recursive: true, force: true });
    actualVersion = null;
  }
  if (!actualVersion) {
    if (fs.existsSync(venvDir)) fs.rmSync(venvDir, { recursive: true, force: true });
    runStep("Creating backend virtual environment", selectedPython.command,
      [...selectedPython.args, "-m", "venv", ".venv"]);
    actualVersion = venvVersion();
  }
  if (!actualVersion || !supportedMinors.has(Number(actualVersion.split(".")[1]))) {
    throw new Error(`Could not create a supported backend/.venv (found ${actualVersion ?? "no Python"}).`);
  }
  log(`backend/.venv Python ${actualVersion}: OK`);

  log("STEP 3/5 — checking/installing Python dependencies");
  const expectedMarker = markerFor(actualVersion);
  const markerMatches = fs.existsSync(dependencyMarker) && fs.readFileSync(dependencyMarker, "utf8").trim() === expectedMarker;
  const importsReady = checkImports().status === 0;
  if (markerMatches && importsReady) {
    log("Torch, NumPy, Transformers, Piper, FastAPI, Uvicorn, HTTP clients, multipart, and Keyring imports: OK (dependencies already provisioned)");
  } else {
    runStep("Upgrading pip", venvPy, ["-m", "pip", "install", "--upgrade", "pip"]);
    const torchCheck = spawnSync(venvPy, ["-c", "import torch"], { stdio: "ignore", windowsHide: true, timeout: 30_000 });
    if (torchCheck.status !== 0 || !markerMatches) {
      const torchArgs = ["-m", "pip", "install", "--upgrade", "torch"];
      if ((process.platform === "win32" || process.platform === "linux") && process.arch === "x64") {
        torchArgs.push("--index-url", "https://download.pytorch.org/whl/cpu");
      }
      runStep("Installing CPU-capable PyTorch", venvPy, torchArgs);
    }
    runStep("Installing backend requirements", venvPy, ["-m", "pip", "install", "--upgrade", "-r", requirementsPath]);
    const importsAfterInstall = checkImports();
    if (importsAfterInstall.error || importsAfterInstall.status !== 0) {
      throw new Error("Dependency installation completed, but one or more required Python imports still fail. Review pip output and run npm run setup:ml again.");
    }
    fs.writeFileSync(dependencyMarker, `${expectedMarker}\n`, "utf8");
    log("All required backend package imports: OK");
  }

  runStep("Checking Python dependency consistency", venvPy, ["-m", "pip", "check"]);

  log("STEP 4/5 — checking/downloading local model assets");
  const missing = [];
  if (!whisperFilesReady()) missing.push(`Whisper config/weights in ${whisperDir}`);
  for (const voice of piperVoices) if (!voiceFilesReady(voice)) missing.push(`${voice} weights/config in ${piperDir}`);
  if (missing.length) {
    log(`Missing model files: ${missing.join("; ")}`);
    runStep("Downloading missing local Whisper and Piper models", venvPy, ["download_models.py"]);
  } else {
    log("Whisper Tiny and both Piper voice model/config pairs: already present");
  }
  if (!whisperFilesReady()) throw new Error(`Whisper model verification failed; missing config.json or model.safetensors in ${whisperDir}.`);
  for (const voice of piperVoices) {
    if (!voiceFilesReady(voice)) throw new Error(`Piper model verification failed; missing ${voice}.onnx or ${voice}.onnx.json in ${piperDir}.`);
  }
  log("All required local speech model files: OK");

  log("STEP 5/5 — provisioning completed; running offline inference checks next");
  log("Run: npm run verify:ml");
}

try {
  main();
} catch (error) {
  errorLog(error instanceof Error ? error.message : String(error));
  errorLog("Provisioning stopped; npm install/npm run dev will not continue in a dummy mode.");
  process.exitCode = 1;
}

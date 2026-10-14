import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { Plugin, Connect } from "vite";

/**
 * Starts and proxies the required local FastAPI/ML backend. There is no dummy
 * backend: a missing or unhealthy ML installation produces a clear 503 error.
 * npm run dev performs strict provisioning and offline inference checks first.
 */
const ML_HOST = "127.0.0.1";
const ML_PORT = Number(process.env.FORMA_ML_PORT ?? 8787);
const BACKEND_DIR = path.resolve(process.cwd(), "../backend");
const PYTHON = process.platform === "win32"
  ? path.join(BACKEND_DIR, ".venv", "Scripts", "python.exe")
  : path.join(BACKEND_DIR, ".venv", "bin", "python");

type Mode = "starting" | "ml" | "failed";
let mode: Mode = "starting";
let child: ChildProcess | null = null;
let startupPromise: Promise<void> | null = null;
let backendError = "The local ML backend has not started yet.";
let retryAt = 0;

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function healthCheck(): Promise<{ healthy: boolean; detail?: string }> {
  return new Promise((resolve) => {
    const req = http.get(`http://${ML_HOST}:${ML_PORT}/api/status`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let status: Record<string, unknown> = {};
        try { status = JSON.parse(data) as Record<string, unknown>; } catch { /* handled below */ }
        if (res.statusCode === 200 && status.stt_ready === true && status.tts_ready === true) {
          resolve({ healthy: true });
          return;
        }
        const details = [
          status.stt_ready === true ? null : `Whisper ready=${String(status.stt_ready ?? "unknown")}`,
          status.tts_ready === true ? null : `Piper ready=${String(status.tts_ready ?? "unknown")}`,
          typeof status.stt_error === "string" ? `Whisper error: ${status.stt_error}` : null,
          typeof status.tts_error === "string" ? `Piper error: ${status.tts_error}` : null,
        ].filter(Boolean).join("; ");
        resolve({ healthy: false, detail: details || `backend returned HTTP ${res.statusCode ?? "unknown"}` });
      });
    });
    req.on("error", (error) => resolve({ healthy: false, detail: error.message }));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve({ healthy: false, detail: "local backend health check timed out" });
    });
  });
}

async function ensureBackend(): Promise<void> {
  if (startupPromise) return startupPromise;
  if (mode === "failed" && Date.now() < retryAt) throw new Error(backendError);

  startupPromise = (async () => {
    const existing = await healthCheck();
    if (existing.healthy) {
      mode = "ml";
      backendError = "";
      console.log("[forma] Local ML backend healthy (Whisper + Piper ready).");
      return;
    }

    if (!fs.existsSync(path.join(BACKEND_DIR, "main.py"))) {
      throw new Error(`Backend entry point not found: ${path.join(BACKEND_DIR, "main.py")}.`);
    }
    if (!fs.existsSync(PYTHON)) {
      throw new Error(`Backend Python environment not found: ${PYTHON}. Run npm run setup:ml from frontend/.`);
    }

    if (!child) {
      console.log(`[forma] Starting local ML backend with ${PYTHON} (port ${ML_PORT})…`);
      child = spawn(PYTHON, ["main.py"], {
        cwd: BACKEND_DIR,
        env: { ...process.env, FORMA_ML_PORT: String(ML_PORT) },
        stdio: ["ignore", "inherit", "inherit"],
        windowsHide: true,
      });
      child.on("error", (error) => {
        backendError = `Could not start the local Python backend: ${error.message}`;
        mode = "failed";
        retryAt = Date.now() + 5000;
        console.error(`[forma] ERROR: ${backendError}`);
        child = null;
      });
      child.on("exit", (code, signal) => {
        if (mode === "ml") console.error(`[forma] ERROR: local ML backend exited after startup (code ${code ?? "none"}, signal ${signal ?? "none"}).`);
        backendError = `Local ML backend exited before becoming healthy (code ${code ?? "none"}, signal ${signal ?? "none"}). Check the Python error above and rerun npm run setup:ml.`;
        mode = "failed";
        retryAt = Date.now() + 5000;
        child = null;
      });
    }

    let lastDetail = existing.detail || "waiting for local backend";
    for (let attempt = 1; attempt <= 50; attempt++) {
      if (mode === "failed" || (child?.exitCode !== null && child?.exitCode !== undefined)) break;
      await new Promise((resolve) => setTimeout(resolve, 400));
      const result = await healthCheck();
      if (result.healthy) {
        mode = "ml";
        backendError = "";
        retryAt = 0;
        console.log("[forma] Local ML backend healthy (Whisper + Piper ready).");
        return;
      }
      lastDetail = result.detail || lastDetail;
    }

    throw new Error(backendError && mode === "failed"
      ? backendError
      : `Local ML backend did not become ready within 20 seconds. Last check: ${lastDetail}. Run npm run setup:ml and inspect the Python logs above.`);
  })().catch((error: unknown) => {
    backendError = error instanceof Error ? error.message : String(error);
    mode = "failed";
    retryAt = Date.now() + 5000;
    console.error(`[forma] ERROR: ${backendError}`);
    throw error;
  }).finally(() => {
    startupPromise = null;
  });

  return startupPromise;
}

function proxyToMl(req: http.IncomingMessage, res: http.ServerResponse) {
  const upstream = http.request({
    host: ML_HOST,
    port: ML_PORT,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: `${ML_HOST}:${ML_PORT}` },
  }, (response) => {
    res.statusCode = response.statusCode ?? 502;
    for (const [key, value] of Object.entries(response.headers)) {
      if (value !== undefined) res.setHeader(key, value as string | number | string[]);
    }
    response.pipe(res);
  });
  upstream.on("error", (error) => {
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify({ detail: `Local ML backend connection failed: ${error.message}. Restart with npm run dev and inspect the backend logs.` }));
  });
  req.pipe(upstream);
}

function backendProxy(): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (!(req.url ?? "").startsWith("/api/")) return next();
    void ensureBackend()
      .then(() => proxyToMl(req, res))
      .catch((error: unknown) => json(res, 503, {
        detail: `Local ML backend unavailable. ${error instanceof Error ? error.message : String(error)}`,
        setup_command: "npm run setup:ml",
      }));
  };
}

export function apiPlugin(): Plugin[] {
  return [{
    name: "forma-required-local-ml-backend",
    configureServer(server) {
      server.middlewares.use(backendProxy());
      server.httpServer?.once("close", () => {
        if (child && !child.killed) child.kill();
      });
      void ensureBackend().catch(() => {
        // The precise failure is already written to the dev-server log; API
        // requests return that same actionable error as HTTP 503, never a stub.
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(backendProxy());
      server.httpServer?.once("close", () => {
        if (child && !child.killed) child.kill();
      });
    },
  }];
}

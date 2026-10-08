import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { Plugin, Connect } from "vite";
import { stubApiPlugin } from "./stubApi";

/**
 * Bakes the real ML backend into the dev/preview server:
 *
 *   1. spawns `backend/main.py` (Whisper Tiny + Piper) if a Python env exists,
 *   2. proxies /api/* to it once healthy,
 *   3. falls back to the dummy stub (clearly labelled) when it is not.
 *
 * Nothing else to run: `npm install && npm run dev` is the whole app.
 */

const ML_HOST = "127.0.0.1";
const ML_PORT = Number(process.env.FORMA_ML_PORT ?? 8787);
const BACKEND_DIR = path.resolve(process.cwd(), "../backend");

type Mode = "starting" | "ml" | "stub";
let mode: Mode = "starting";
let child: ChildProcess | null = null;

function findPython(): string | null {
  const candidates =
    process.platform === "win32"
      ? [path.join(BACKEND_DIR, ".venv", "Scripts", "python.exe")]
      : [path.join(BACKEND_DIR, ".venv", "bin", "python")];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  for (const c of ["python3", "python"]) return c; // last resort: ambient python
  return null;
}

function mlExists(): boolean {
  return fs.existsSync(path.join(BACKEND_DIR, "main.py"));
}

function healthCheck(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://${ML_HOST}:${ML_PORT}/api/status`, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(res.statusCode === 200 && data.includes("stt_ready")));
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureBackend(): Promise<Mode> {
  if (mode === "ml") return mode;
  if (!mlExists()) {
    mode = "stub";
    return mode;
  }
  // reuse an already-running backend (e.g. started manually) before spawning
  if (await healthCheck()) {
    if (mode !== "ml") console.log("[forma] ML backend healthy — real Whisper Tiny + Piper online");
    mode = "ml";
    return mode;
  }
  if (!child) {
    const python = findPython();
    if (!python) {
      mode = "stub";
      return mode;
    }
    console.log(`[forma] starting ML backend: ${python} main.py (port ${ML_PORT})`);
    child = spawn(python, ["main.py"], {
      cwd: BACKEND_DIR,
      env: { ...process.env, FORMA_ML_PORT: String(ML_PORT) },
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("exit", (code) => {
      console.warn(`[forma] ML backend exited (code ${code}) — falling back to dummy stub`);
      child = null;
      mode = "stub";
    });
  }
  for (let i = 0; i < 40; i++) {
    if (await healthCheck()) {
      if (mode !== "ml") console.log("[forma] ML backend healthy — real Whisper Tiny + Piper online");
      mode = "ml";
      return mode;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.warn("[forma] ML backend did not become healthy — using dummy stub");
  mode = "stub";
  return mode;
}

function proxyToMl(req: http.IncomingMessage, res: http.ServerResponse) {
  const upstream = http.request(
    {
      host: ML_HOST,
      port: ML_PORT,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `${ML_HOST}:${ML_PORT}` },
    },
    (up) => {
      res.statusCode = up.statusCode ?? 502;
      for (const [k, v] of Object.entries(up.headers)) {
        if (v !== undefined) res.setHeader(k, v as string | number | string[]);
      }
      up.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
    }
    res.end(JSON.stringify({ detail: "ML backend connection failed." }));
  });
  req.pipe(upstream);
}

function mlProxyHandler(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = req.url ?? "";
    if (!url.startsWith("/api/")) return next();
    void ensureBackend().then((m) => {
      if (m === "ml") return proxyToMl(req, res);
      next(); // fall through to the stub plugin
    });
  };
}

export function apiPlugin(): Plugin[] {
  return [
    {
      name: "forma-ml-bridge",
      configureServer(server) {
        server.middlewares.use(mlProxyHandler());
        void ensureBackend();
      },
      configurePreviewServer(server) {
        server.middlewares.use(mlProxyHandler());
        void ensureBackend();
      },
    },
    stubApiPlugin(),
  ];
}

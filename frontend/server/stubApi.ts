import type { Plugin, Connect } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

/** Honest dummy speech API used only when the optional Python backend is absent. */
const STUB_TEXT =
  "[dummy backend] This is a stub transcription. Your audio reached the server and the whole pipeline works — " +
  "the local Whisper Tiny model will replace this text once it is connected.";

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    req.on("data", (c: Uint8Array) => chunks.push(c));
    req.on("end", () => {
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        out.set(c, off);
        off += c.length;
      }
      resolve(out);
    });
    req.on("error", reject);
  });
}

/** 16-bit PCM mono WAV — a soft pentatonic tone sequence, clearly a stub. */
function synthWav(text: string, voice: string, lengthScale: number): Uint8Array {
  const sr = 22050;
  const noteDur = Math.max(0.12, 0.34 * lengthScale);
  const notes = Math.max(3, Math.min(22, Math.ceil(text.length / 6)));
  const total = Math.min(12, notes * noteDur);
  const n = Math.floor(sr * total);
  const bytes = new Uint8Array(44 + n * 2);
  const dv = new DataView(bytes.buffer);
  const ascii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  dv.setUint32(4, 36 + n * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  ascii(36, "data");
  dv.setUint32(40, n * 2, true);
  const base = voice === "alba" ? 440 : 329.63;
  const scale = [1, 1.122, 1.26, 1.498, 1.682, 2, 2.245, 2.52];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const idx = Math.floor(t / noteDur);
    const noteT = t - idx * noteDur;
    const freq = base * scale[(idx * 3 + 1) % scale.length] * (1 + 0.002 * Math.sin(t * 5.5));
    const env = Math.min(1, noteT / 0.02) * Math.exp((-3.2 * noteT) / noteDur);
    const s = Math.sin(2 * Math.PI * freq * t) * 0.55 + Math.sin(4 * Math.PI * freq * t) * 0.22 + Math.sin(6 * Math.PI * freq * t) * 0.08;
    dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s * env * 0.8)) * 32767, true);
  }
  return bytes;
}

export function stubApiPlugin(): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? "";
    if (!url.startsWith("/api/")) return next();
    const started = Date.now();

    if (req.method === "GET" && url === "/api/status") {
      return json(res, 200, {
        stt_ready: true,
        tts_ready: true,
        stt_model: "dummy-stt v0 (stub)",
        tts_model: "dummy-tts v0 (stub)",
        stub: true,
      });
    }

    if (req.method === "GET" && url === "/api/gemini/settings") {
      return json(res, 200, {
        configured: Boolean(process.env.FORMA_GEMINI_API_KEY),
        vault_available: false,
        key_source: process.env.FORMA_GEMINI_API_KEY ? "environment" : null,
        model_default: "gemini-3.5-flash-lite",
        message: "The Python credential service is unavailable; saved-key settings need the real backend.",
      });
    }

    if (url.startsWith("/api/gemini/")) {
      return json(res, 503, {
        detail: "Gemini needs the Python backend and an OS credential vault. Install/start the real backend, then add the key in Settings.",
      });
    }

    if (req.method === "POST" && url === "/api/transcribe") {
      void (async () => {
        try {
          const body = await readBody(req);
          const type = String(req.headers["content-type"] ?? "");
          let language = "auto";
          let audioBytes = body.length;
          if (type.includes("multipart/form-data")) {
            const formReq = new Request("http://local/api/transcribe", {
              method: "POST",
              headers: { "content-type": type },
              body: body as unknown as BodyInit,
            });
            const form = await formReq.formData();
            language = String(form.get("language") ?? "auto");
            const file = form.get("audio");
            if (file && typeof file === "object" && "size" in file) audioBytes = file.size;
          }
          await new Promise((r) => setTimeout(r, 320));
          json(res, 200, {
            text: `${STUB_TEXT}\n\n(audio: ${audioBytes} bytes · language: ${language})`,
            language,
            duration_ms: Date.now() - started,
            stub: true,
          });
        } catch {
          json(res, 400, { detail: "Could not parse the uploaded audio." });
        }
      })();
      return;
    }

    if (req.method === "POST" && url === "/api/synthesize") {
      void (async () => {
        try {
          const body = await readBody(req);
          const payload = JSON.parse(new TextDecoder().decode(body)) as { text?: string; voice?: string; length_scale?: number };
          const text = String(payload.text ?? "");
          if (!text.trim()) return json(res, 400, { detail: "Text is required." });
          await new Promise((r) => setTimeout(r, 260));
          const wav = synthWav(text, String(payload.voice ?? "lessac"), Number(payload.length_scale ?? 1));
          res.statusCode = 200;
          res.setHeader("Content-Type", "audio/wav");
          res.setHeader("X-Stub", "1");
          res.end(Buffer.from(wav));
        } catch {
          json(res, 400, { detail: "Could not read the synthesis request." });
        }
      })();
      return;
    }

    json(res, 404, { detail: "Unknown API route." });
  };

  return {
    name: "forma-stub-speech-api",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

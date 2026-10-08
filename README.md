# Forma — Local Voice Studio

A lightweight, fully **local** speech-to-text + text-to-speech studio in the
browser. Record or upload audio → transcribe it with **Whisper Tiny** → edit →
speak it back with **Piper VITS**. No cloud speech APIs, no API keys, works
offline after the first install.

> Record-and-transcribe, honestly labelled — not streaming ASR, not a new
> architecture. The UI is the showpiece: a live-reactive voice studio built on
> the registered **ThreeUI Predictive Arc**.

---

## Quick start

```bash
npm install     # UI + the whole ML backend, provisioned automatically
npm run dev     # → http://localhost:5173
```

That's it. `npm install` bakes the real backend in (see below); `npm run dev`
starts the UI **and** the speech engine together.

**Requirements**

| | |
|---|---|
| Node | 20+ |
| Python | 3.10–3.12 on PATH (`python3` / `python`, Windows: `py` launcher) |
| Disk | ~700 MB one-time (models + Python venv + `node_modules`) |
| Network | only for `npm install`; everything is offline afterwards |

No Python? `npm install` still succeeds and the app runs in clearly-labelled
**DUMMY MODE** (stub responses, never presented as real transcription).

---

## What `npm install` bakes in

`postinstall` runs `frontend/scripts/setup-ml.mjs` (cross-platform, idempotent,
milliseconds on later installs):

1. Creates `backend/.venv` and installs torch (CPU), FastAPI, transformers, piper
2. Downloads **whisper-tiny** (safetensors only — no duplicate formats) and two
   **Piper** voices into `~/.cache/forma/models` (override: `FORMA_MODELS_DIR`)
3. Never fails `npm install` — problems print a warning and the app falls back
   to DUMMY MODE until you retry `npm run setup:ml`

Skip it entirely with `FORMA_SKIP_ML=1 npm install`.

## How it runs

`npm run dev` starts Vite, which spawns `backend/main.py` (FastAPI), health-checks
it, and proxies `/api/*` to it on port 8787. If Python or models are missing — or
the backend ever dies — the bundled stub takes over and the UI status pill shows
**DUMMY MODE** (API answers carry `stub: true`). The contract is identical in
both modes, so the UI never lies about what's underneath.

---

## Using the studio

1. **01 Capture your voice** — record from the mic (live animated wave) or upload
   a file; pick a language or auto-detect
2. **02 Make it yours** — transcript appears in the editor; copy or export `.txt`
3. **03 Give your words a voice** — choose a voice (Lessac / Alba), pace, and
   generate; the playback wave reacts to the audio

Everything above is visible on launch — no scrolling, no clutter. Light + dark
themes, multilingual UI (en, fr, es, pt, ar, de, zh, hi, yo, ha).

## API contract

| Endpoint | Body | Returns |
|---|---|---|
| `GET /api/status` | — | `{ stt_ready, tts_ready, stub, stt_model, tts_model, … }` |
| `POST /api/transcribe` | multipart `audio` (wav), `language` | `{ text, language, duration_ms, stub }` |
| `POST /api/synthesize` | JSON `text`, `voice`, `length_scale` | `audio/wav` |

```bash
curl -X POST http://localhost:5173/api/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from the local engine.","voice":"lessac"}' -o out.wav
curl -X POST http://localhost:5173/api/transcribe -F "audio=@out.wav" -F "language=auto"
```

Audio handling is ffmpeg-free: raw PCM is captured in the browser and shipped as
16 kHz mono WAV; uploads are decoded to WAV in the browser.

## Models

| Role | Model | Size | Where |
|---|---|---|---|
| STT | `openai/whisper-tiny` (multilingual) | ~150 MB | `~/.cache/forma/models/whisper-tiny` |
| TTS | Piper `en_US-lessac-medium` | ~61 MB | `~/.cache/forma/models/` |
| TTS | Piper `en_GB-alba-medium` | ~61 MB | `~/.cache/forma/models/` |

Weights are **cache, not source** — `.gitignore` excludes them and
`npm install` restores them anywhere.

## Configuration

| Env var | Meaning |
|---|---|
| `FORMA_MODELS_DIR` | where model weights live (default `~/.cache/forma/models`) |
| `FORMA_STT_MODEL` | path or HF id for the STT model — point this at a fine-tuned checkpoint |
| `FORMA_TTS_DIR` | directory with Piper `*.onnx` voices |
| `FORMA_SKIP_ML=1` | skip ML provisioning at `npm install` (DUMMY MODE) |

## Verification

```bash
npm run build              # typecheck + production build
node scripts/verify.mjs    # 22 headless browser checks (adaptive real/stub)
node scripts/verify-mic.mjs # 8 fake-mic recording checks
```

The suite is adaptive: it reads `/api/status` and verifies real transcription
when the ML backend is up, or honest stub labelling when it isn't.

## Project layout

```
backend/          FastAPI speech engine (main.py, stt.py, tts.py)
frontend/         Vite + React studio (src/components, src/shaders, …)
  server/         apiPlugin.ts (spawn + proxy), stubApi.ts (fallback)
  scripts/        setup-ml.mjs, verify.mjs, verify-mic.mjs
threeui/          registered Predictive Arc bundle (reference of record)
scripts/          serve.sh
```

## Design & provenance

- **ThreeUI Predictive Arc** — built from the exact registered bundle
  (revision `fa86582fc870`), 16/16 shader files SHA-256 verified, never
  modified; the animated wave and arc band run these shaders
- UI components from **shadcn/ui** and **magicui**, motion with **GSAP**
- Typeface: **Fragment Mono** (SIL Open Font License)
- Honest-by-design: dummy responses are labelled, sample text is labelled, and
  the status pill always shows which engine is actually running

## Roadmap

Blueprint next steps: fine-tune Whisper Tiny on a speech dataset and evaluate
with WER, comparing the pretrained and fine-tuned models through this app —
just point `FORMA_STT_MODEL` at the trained checkpoint. Results will be measured
and reported honestly, never manufactured.

## License notes

Project code: MIT intent. Model weights keep their own licenses (Whisper:
MIT; Piper voices: MIT/CC — see voice `.onnx.json` metadata). Fragment Mono: SIL OFL 1.1.

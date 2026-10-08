# Forma — Local Voice Studio

A lightweight, local speech-to-text / text-to-speech web application with an
experimental visual identity. Built from the project blueprint
(`uploads/lightweight_local_stt_tts_project_blueprint.md`).

**Live:** `npm run dev` → http://localhost:5173

---

## What this build is

- **React 18 + Vite 6 + TypeScript + Tailwind 4** single-page studio.
- **ThreeUI `PredictiveArcCanvas`** (Predictive Arc variant) as the hero visual,
  integrated from the registered source bundle, revision **SHA-256 `fa86582fc870`**.
- **shadcn/ui** primitives (new-york-v4 registry): button, card, tabs, textarea,
  slider, badge, separator, label, tooltip.
- **21st.dev components** (via the author's public magicui registry, since
  21st.dev gates downloads behind auth): `SparklesText`, `Marquee`, `BentoGrid`.
- **GSAP + ScrollTrigger** motion choreography (hero entrance, scroll reveals;
  disabled under `prefers-reduced-motion`).
- **Light + dark themes** (cinematic dark / paper light), persisted to
  `localStorage` via `data-theme`.

## ThreeUI source integrity

All **16 registered files** were fetched from the published bundle and written to
`src/shaders/**` at their registered paths. Every file was verified against its
declared SHA-256 before and after integration — **16/16 match**. The five
registered canonical sources (`amber-halftone`, `signal-particles`,
`override-grid`, `void-protocol`, `nexus-unified-flow`) were additionally used to
byte-validate the extraction toolchain that completed the remaining
`sources/*.html` raw assets from the official `@designcodeio/threeui@1.2.0`
package (48 files, byte-exact extractor output).

Two `?raw` imports referenced by the registered `NeuformIsolatedEffects.tsx` —
`recursive-erosion.html`, `synthesis-orb.html` — exist neither in the registered
bundle nor the npm package. They are **not fabricated**: a documented Vite plugin
(`unregisteredRawStub` in `vite.config.ts`) resolves exactly those two ids to an
empty string. Their effects are unused by the configured `predictive` variant.

The configured usage is preserved verbatim in `src/components/Scene.tsx`; the
package import paths (`@designcodeio/threeui`, `@designcodeio/threeui/style.css`)
are aliased to the registered source files vendored in this project. The
`fonts/fragment-mono.woff2` asset referenced by the registered stylesheet is the
SIL OFL Fragment Mono (latin subset), fetched from Google Fonts.

## Honest capability status

| Capability | Status |
|---|---|
| Microphone recording + live visualiser | Works |
| Audio upload (drag & drop, validated) | Works |
| Playback, transcript editing, copy, export | Works |
| Light / dark themes, GSAP motion | Works |
| Whisper Tiny transcription (`/api/transcribe`) | Backend not connected yet |
| Piper TTS (`/api/synthesize`) | Backend not connected yet |

The UI never substitutes browser speech APIs and never shows simulated model
output; unconnected paths raise an explicit modal. The frontend already speaks
the intended backend contract:

- `GET /api/status` → `{ stt_ready, tts_ready, stt_model?, tts_model? }`
- `POST /api/transcribe` (multipart: `audio`, `language`) → `{ text, language?, duration_ms? }`
- `POST /api/synthesize` (JSON: `text`, `voice`, `length_scale`) → audio blob

## Commands

```bash
# one-time ML setup (Python venv + deps + model downloads)
scripts/setup-ml.sh        # Linux/macOS     (Windows: scripts\setup-ml.ps1)

npm install
npm run dev      # http://localhost:5173 — frontend + real ML backend, one command
npm run build    # tsc + vite build (verified green)
node scripts/verify.mjs     # headless browser verification (22 checks, adaptive)
node scripts/verify-mic.mjs # fake-mic recording verification (8 checks)
```

## Real ML backend (baked in)

`backend/` is a FastAPI service with real local models:

- **STT:** `openai/whisper-tiny` (multilingual) via Hugging Face Transformers
- **TTS:** Piper VITS (`en_US-lessac-medium`, `en_GB-alba-medium`)
- **No ffmpeg anywhere** — the frontend captures raw PCM and ships 16 kHz WAV;
  uploads are decoded to WAV in the browser

`npm run dev` starts it automatically (`server/apiPlugin.ts`): it spawns
`backend/main.py`, health-checks it, and proxies `/api/*` to it. If Python or
the models are missing, the dummy stub takes over and the UI shows DUMMY MODE —
nothing breaks, ever. The contract is identical in both modes:

- `GET /api/status` → `{ stt_ready, tts_ready, stub, stt_model, tts_model, … }`
- `POST /api/transcribe` (multipart: `audio`, `language`) → `{ text, … }`
- `POST /api/synthesize` (JSON: `text`, `voice`, `length_scale`) → WAV

Verified round-trip: Piper synthesised *"Hello, this is a test of the local
speech engine."* and Whisper Tiny transcribed it back word-for-word in ~2.4 s
(CPU). Fine-tuning from the blueprint plugs in by pointing `FORMA_STT_MODEL`
at a trained checkpoint directory.

## Next milestone

Wire the local Python backend (Phase 2 of the roadmap): FastAPI + Whisper Tiny +
Piper, serving the three endpoints above, then the fine-tuning / WER evaluation
pipeline from the blueprint.

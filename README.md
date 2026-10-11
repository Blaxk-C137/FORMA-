# Forma — Local Voice Studio

A local-first desktop web app for transcribing, refining, searching, and speaking text. Record or upload audio, transcribe it with **Whisper Tiny**, optionally refurbish text or search the web with **Gemini**, then speak it with **Piper VITS**.

Speech audio stays on the device. Gemini is optional and is called only when the user explicitly clicks a Gemini action.

## Quick start

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. `npm install` provisions the Python speech backend and downloads the models; `npm run dev` starts the UI and backend together. No manual backend command is required.

### Requirements

- Node.js 20+
- Python 3.10–3.12 recommended and available on PATH (`py -3` on Windows). Python 3.13 was exercised in the development environment; Windows compatibility may depend on current PyTorch/Piper wheels.
- About 700 MB of one-time model/runtime downloads, plus Node and Python development dependencies. Model weights live outside the repository in `~/.cache/forma/models` by default.
- Internet only for installation/model downloads and optional Gemini requests. Local Whisper/Piper speech works offline after setup.

If Python is missing, npm installation remains successful and speech falls back to clearly labelled **DUMMY MODE**. Dummy output is never presented as real speech recognition.

## What installation provisions

The frontend `postinstall` script runs `frontend/scripts/setup-ml.mjs`. It is cross-platform and idempotent:

1. Creates `backend/.venv`.
2. Installs CPU PyTorch and the FastAPI, Transformers, Piper, and keyring requirements.
3. Downloads Whisper Tiny (safetensors only) and the Lessac/Alba Piper voices into the model cache.

The real backend is started automatically by Vite. To skip ML setup for UI-only work, use `FORMA_SKIP_ML=1 npm install`. To retry or repair provisioning, run `npm run setup:ml` from `frontend/`.

## Studio features

- **Record and transcribe:** Mic or audio upload; local Whisper Tiny; language selection; animated mic/playback wave.
- **Append segments:** Each microphone recording stops safely at two minutes. Choose **Add more audio** to record another part; newly transcribed words append to the existing transcript.
- **Restart session:** Saves the transcript in History, then clears the editor and current audio.
- **Refurbish with Gemini:** Generates a suggestion on click. Review it, export it, apply it, or discard it; the original text is not silently replaced.
- **Voice web search:** Speak a query; local Whisper turns it into editable text. Only after **Search the web** is clicked does the query go to Gemini with Google Search grounding. The result is cited and can be exported. Search answers are deliberately not placed in History.
- **Session history:** Search, reopen, export, delete individual sessions, or clear all. Transcript text and metadata are saved in this browser only; audio is not archived.
- **Export:** Transcript, Gemini suggestion, individual search result, or session history in plain text (`.txt`), Markdown (`.md`), JSON, CSV, HTML, or print/save as PDF. Generated Piper speech can be downloaded as WAV. No timestamps are fabricated, so no SRT export is offered.
- Light and dark themes. Desktop has labelled side navigation; mobile uses a compact bottom navigation bar and no sidepane.

## Gemini key and privacy

Gemini is optional; Whisper/Piper remain local whether or not a key is configured.

- Enter a key in **Settings → Gemini API key**. Forma verifies it with Google's model-list endpoint, then the local Python backend saves it in the OS credential vault (Windows Credential Manager on Windows). The key is never returned to the UI or saved in browser local storage. Remove/replace it from Settings.
- An environment-managed key is also supported with `FORMA_GEMINI_API_KEY`.
- **Refurbishment** sends the current transcript text to Google only when its button is clicked. The app displays a separate suggestion for review.
- **Voice web search** records and recognizes speech locally; only the transcribed query text is sent to Google after the user clicks Search. The microphone audio is not uploaded to Gemini.
- API-key use is tied to the user's Google project, quotas, tier, and potential charges. Review the current [Gemini API terms](https://ai.google.dev/gemini-api/terms) and [privacy/data-use rules](https://ai.google.dev/gemini-api/terms#data-use-unpaid) before sending sensitive text.
- Google's terms for Search grounding state that prompts, context, and outputs may be stored for 30 days. Search-grounded responses and their associated Search Suggestions are shown together. Forma does not automatically save grounded results; users may export an individual displayed result.

The in-app **Terms & privacy** page summarizes the local/cloud boundary and links to Google's current terms.

## Gemini models and pricing

The model picker includes stable text models that currently support text generation and Google Search grounding; preview-only and access-restricted legacy entries are omitted. **Gemini 3.5 Flash-Lite** is the fast, low-latency default; **Gemini 3.1 Flash-Lite** has the lowest text-token rates in the list. Availability, free quotas, and billing eligibility can still vary by Google project, account, region, and current limits. Nigeria appears in Google's published [available regions](https://ai.google.dev/gemini-api/docs/available-regions).

Standard paid-tier rates below are from Google's pricing page, checked **10 October 2026**, in USD per million tokens. Free-tier text input/output is listed as free for these models, subject to quotas and Google's free-tier data-use terms.

| Stable model | Standard paid input | Standard paid output | Search grounding |
|---|---:|---:|---|
| `gemini-3.1-flash-lite` | $0.25 / 1M text input tokens | $1.50 / 1M output tokens | Supported |
| `gemini-3.5-flash-lite` | $0.30 / 1M input tokens | $2.50 / 1M output tokens | Supported |
| `gemini-3.6-flash` | $0.75 through 31 Dec 2026; $1.50 from 1 Jan 2027 | $3.75 through 31 Dec 2026; $7.50 from 1 Jan 2027 | Supported |
| `gemini-3.8-flash` | $0.75 through 31 Dec 2026; $1.50 from 1 Jan 2027 | $3.75 through 31 Dec 2026; $7.50 from 1 Jan 2027 | Supported |

**Google Search grounding:** unavailable through the Gemini API free tier. For paid-tier projects, Google currently lists 5,000 grounding search requests per month shared across Gemini 3 and newer models, then **$14 per 1,000 requests**. One prompt may trigger multiple search requests; standard Gemini token charges can also apply. Pricing changes, so check the live [pricing](https://ai.google.dev/gemini-api/docs/pricing) and [model availability](https://ai.google.dev/gemini-api/docs/models) pages.

Google's published free-tier terms say submitted prompts/outputs may be used to improve Google products; paid-tier inputs/outputs are not used for that purpose. Use Settings to switch stable models, and review Google’s current terms/pricing before sending sensitive content or enabling search.

## API

The Vite server automatically proxies `/api/*` to the local FastAPI service on port 8787. When the ML backend is unavailable, speech endpoints use the clearly labelled stub; Gemini endpoints return an honest setup error.

| Endpoint | Purpose |
|---|---|
| `GET /api/status` | Local STT/TTS readiness and honest stub flag |
| `POST /api/transcribe` | Multipart WAV `audio` + `language` → transcript |
| `POST /api/synthesize` | JSON `text`, `voice`, `length_scale` → `audio/wav` |
| `GET /api/gemini/settings` | Key configured/vault availability (never returns the secret) |
| `POST /api/gemini/key` | Verify key, then store in OS credential vault |
| `DELETE /api/gemini/key` | Remove saved key from vault |
| `POST /api/gemini/refurbish` | Text improvement suggestion with selected stable model |
| `POST /api/gemini/search` | Grounded web answer, sources, queries, and Google Search Suggestions |

The audio pipeline is ffmpeg-free: browser capture and upload decoding produce 16 kHz mono WAV for the local Whisper API.

## Configuration

| Variable | Purpose |
|---|---|
| `FORMA_MODELS_DIR` | Model cache directory (default `~/.cache/forma/models`) |
| `FORMA_STT_MODEL` | Local or Hugging Face STT model/checkpoint path |
| `FORMA_TTS_DIR` | Piper voice directory |
| `FORMA_SKIP_ML=1` | Skip ML provisioning during `npm install` |
| `FORMA_GEMINI_API_KEY` | Optional environment-managed Gemini key |
| `FORMA_ML_PORT` | Local FastAPI port (default `8787`) |
| `FORMA_USE_SYSTEM_PYTHON=1` | Allow the Vite bridge to use an ambient Python with FastAPI installed |

The selected Gemini model and transcript history are browser preferences/data; the API key is not.

## Verification

From `frontend/`:

```bash
npm run build
node scripts/verify.mjs
node scripts/verify-mic.mjs
```

The browser suite checks the real Piper→Whisper round trip when the backend is ready (otherwise it checks the explicitly labelled dummy result), plus navigation, exports, history, and a synthetic Gemini UI fixture that makes no real API request. Mic tests use Playwright's fake microphone. Model outputs can vary, so transcription checks use tolerant text matching.

## Project layout

```
backend/                   FastAPI services: Whisper, Piper, Gemini, download_models.py
frontend/src/App.tsx        Page shell, studio workflow, history/session state
frontend/src/pages/         Voice search, session history, Settings, Terms & privacy
frontend/src/components/    Capture, transcript, output, export components
frontend/src/lib/            WAV, export, history, Gemini model/API helpers
frontend/server/             Vite ML bridge + labelled stub API
frontend/scripts/             ML setup and Playwright checks
threeui/predictive-arc.json   Registered Predictive Arc bundle reference
```

## Design and provenance

- Main studio built around the exact registered **ThreeUI Predictive Arc** bundle (revision `fa86582fc870`); registered shader sources are integrity-protected and not edited.
- UI components: shadcn/ui and Magic UI; motion/wave visuals stay focused on the working studio, with promotional sections removed from the main page.
- Fragment Mono font carries the SIL Open Font License.

## Roadmap

Fine-tune Whisper Tiny on a suitable multilingual speech dataset and run a real Word Error Rate (WER) comparison against the pretrained checkpoint. `FORMA_STT_MODEL` is the checkpoint hook. WER and timing figures must be measured, never invented.

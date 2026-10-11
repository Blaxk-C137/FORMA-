# Forma — Local Voice Studio

A local-first desktop web app for transcribing, refining, searching, and speaking text. Record or upload audio, transcribe it with **Whisper Tiny**, optionally refurbish text or search the web with **Gemini**, then speak it with **Piper VITS**.

Speech audio stays on the device. Gemini and direct Google Agent Search are optional; their cloud requests happen only after the user explicitly clicks the relevant action.

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
- **Switchable voice search:** Speak a query; local Whisper turns it into editable text. Choose Gemini's Interactions API with Google Search grounding (`store: false`) for an AI answer with parsed citations, or Google Agent Search for clean title/URL/snippet cards from the public websites indexed by the user's Cloud app. Search results are temporary in Forma and exportable; neither provider's results enter History. Direct Agent Search is configured separately and is not unrestricted Google Web Search.
- **Session history:** Search, reopen, export, delete individual sessions, or clear all. Transcript text and metadata are saved in this browser only; audio is not archived.
- **Export:** Transcript, Gemini suggestion, individual search result, or session history in plain text (`.txt`), Markdown (`.md`), JSON, CSV, HTML, or print/save as PDF. Generated Piper speech can be downloaded as WAV. No timestamps are fabricated, so no SRT export is offered.
- Light and dark themes. Desktop has labelled side navigation; mobile uses a compact bottom navigation bar and no sidepane.

## Search providers, keys and privacy

Gemini and Google Agent Search are optional; Whisper/Piper remain local whether or not a cloud key is configured.

- Enter a key in **Settings → Gemini API key**. The local Python backend verifies it with Google's model-list endpoint, then saves it in the OS credential vault (Windows Credential Manager on Windows). The key is never returned to the UI or saved in browser storage. `FORMA_GEMINI_API_KEY` is also supported for managed installations.
- **Google Agent Search** needs its own Google Cloud API key, project ID, app/engine ID, and location. Restrict the key to Discovery Engine, but do not add an HTTP-referrer restriction: SearchLite is called by Forma's local backend. Settings stores the secret in the same OS vault; the app ID and location are configuration only. Environment-managed installs can set `FORMA_AGENT_SEARCH_API_KEY`, `FORMA_AGENT_SEARCH_PROJECT_ID`, `FORMA_AGENT_SEARCH_ENGINE_ID`, and optional `FORMA_AGENT_SEARCH_LOCATION` (`global`, `us`, or `eu`). The Agent Search key is never returned to the browser.
- **Refurbishment** sends transcript text only when its button is clicked. The suggestion is separate and requires review.
- **Search** always recognizes the microphone locally; audio is never uploaded. Only the query text is sent to the selected Google provider after the user clicks Search. Gemini-grounded answers are parsed from citation annotations; direct Agent Search uses Google's structured response fields and searches the public websites in the configured app.
- Upstream HTTP 429s retain Google's status, quota metric, and retry hint where supplied. Gemini rate limits are per project/model and grounding can have an independent quota; compare the exact project and metric with Google's [rate-limit guide](https://ai.google.dev/gemini-api/docs/rate-limits). Direct Agent Search has separate Google Cloud quotas and billing.
- Google's Search-grounding terms state prompts, context, and outputs may be stored for 30 days even though Forma sets Interactions API `store: false`. Grounded answers and associated Search Suggestions are displayed together. Neither provider's results are saved to Forma History; users can export them individually.

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

**Google Agent Search:** the direct result-card provider searches only the public-site data store attached to the configured Cloud app. Google's pricing page currently advertises a 10,000-query/month free trial per account and lists Standard Search at **$1.50 per 1,000 queries**; indexing/storage and optional features can cost extra. See the live [Agent Search pricing](https://cloud.google.com/generative-ai-app-builder/pricing) and [searchLite API guide](https://docs.cloud.google.com/generative-ai-app-builder/docs/preview-search-results).

Google's published free-tier terms say submitted prompts/outputs may be used to improve Google products; paid-tier inputs/outputs are not used for that purpose. Use Settings to switch stable models, and review Google’s current terms/pricing before sending sensitive content or enabling search.

## API

The Vite server automatically proxies `/api/*` to the local FastAPI service on port 8787. The UI binds to loopback by default so saved API credentials are not exposed to the LAN; the Python backend also stays loopback-only and has CORS disabled. Arena preview deployments explicitly opt into their proxy host with `FORMA_PREVIEW_MODE=1`. When the ML backend is unavailable, speech endpoints use the clearly labelled stub; cloud endpoints return an honest setup error.

| Endpoint | Purpose |
|---|---|
| `GET /api/status` | Local STT/TTS readiness and honest stub flag |
| `POST /api/transcribe` | Multipart WAV `audio` + `language` → transcript |
| `POST /api/synthesize` | JSON `text`, `voice`, `length_scale` → `audio/wav` |
| `GET /api/gemini/settings` | Key configured/vault availability (never returns the secret) |
| `POST /api/gemini/key` | Verify key, then store in OS credential vault |
| `DELETE /api/gemini/key` | Remove saved key from vault |
| `POST /api/gemini/refurbish` | Text improvement suggestion with selected stable model |
| `POST /api/gemini/search` | Gemini Interactions API Google Search grounding, parsed answer citations, sources, queries, and Search Suggestions (`store: false`) |
| `GET /api/agent-search/settings` | Direct Google Agent Search configuration status (never returns the key) |
| `PUT /api/agent-search/settings` | Save Cloud project/app settings and key in the OS credential vault |
| `DELETE /api/agent-search/settings` | Remove saved Agent Search credentials/configuration |
| `POST /api/agent-search/search` | Structured Google Agent Search result cards from the configured public-site index |

The audio pipeline is ffmpeg-free: browser capture and upload decoding produce 16 kHz mono WAV for the local Whisper API.

## Configuration

| Variable | Purpose |
|---|---|
| `FORMA_MODELS_DIR` | Model cache directory (default `~/.cache/forma/models`) |
| `FORMA_STT_MODEL` | Local or Hugging Face STT model/checkpoint path |
| `FORMA_TTS_DIR` | Piper voice directory |
| `FORMA_SKIP_ML=1` | Skip ML provisioning during `npm install` |
| `FORMA_GEMINI_API_KEY` | Optional environment-managed Gemini key |
| `FORMA_AGENT_SEARCH_API_KEY` | Optional environment-managed Agent Search API key |
| `FORMA_AGENT_SEARCH_PROJECT_ID` | Google Cloud project ID for Agent Search |
| `FORMA_AGENT_SEARCH_ENGINE_ID` | Agent Search app/engine ID |
| `FORMA_AGENT_SEARCH_LOCATION` | Agent Search location: `global`, `us`, or `eu` (default `global`) |
| `FORMA_ML_PORT` | Local FastAPI port (default `8787`) |
| `FORMA_USE_SYSTEM_PYTHON=1` | Allow the Vite bridge to use an ambient Python with FastAPI installed |

The selected Gemini model and transcript history are browser preferences/data; the API key is not.

## Verification

From `frontend/`:

```bash
npm run build
node scripts/verify.mjs
node scripts/verify-mic.mjs
python ../backend/verify_search.py
```

The browser suite checks the real Piper→Whisper round trip when the backend is ready (otherwise it checks the explicitly labelled dummy result), plus navigation, exports, history, and synthetic Gemini success/429 UI fixtures that make no real API request. Backend parser fixtures cover Gemini citation annotations, quota errors, and clean Agent Search result parsing without calling Google. Mic tests use Playwright's fake microphone. Model outputs can vary, so transcription checks use tolerant text matching.

## Project layout

```
backend/                   FastAPI services: Whisper, Piper, Gemini, Google Agent Search
frontend/src/App.tsx        Page shell, studio workflow, history/session state
frontend/src/pages/         Voice search, session history, Settings, Terms & privacy
frontend/src/components/    Capture, transcript, output, export components
frontend/src/lib/            WAV, export, history, Gemini and Agent Search API helpers
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

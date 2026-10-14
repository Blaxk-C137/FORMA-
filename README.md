# Forma — Local Voice Studio

A local-first desktop web app for transcribing, refining, searching, and speaking text. Record or upload audio, transcribe it with **Whisper Tiny**, search the web with Tavily's **free keyless mode**, optionally summarize results or refurbish text with **Gemini**, then speak it with **Piper VITS**.

Speech audio stays on the device. Tavily and Gemini are optional; their cloud requests happen only after the user explicitly clicks the relevant action.

## Quick start

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. `npm install` provisions the Python speech backend and downloads the models; `npm run dev` starts the UI and backend together. No manual backend command is required.

### Requirements

- Node.js 20+
- Python 3.10, 3.11, or 3.12 installed (Windows: Python Launcher `py`; other OSs: `python3`/`python`). The installer selects a supported version and rejects unsupported runtimes.
- Windows is the primary target. The installer selects OS-appropriate PyTorch installation paths, but support still depends on Python/Piper/PyTorch wheels for that OS and CPU architecture; unsupported combinations stop with an error rather than entering a fallback mode.
- About 700 MB of one-time model/runtime downloads, plus Node and Python development dependencies. Model weights live outside the repository in `~/.cache/forma/models` by default.
- Internet for installation/model downloads and when the user explicitly chooses Tavily search or Gemini features. Local Whisper/Piper speech works offline after setup.

**There is no dummy speech mode.** If Python, packages, model files, or the local inference check is missing or fails, `npm install` exits with an error and logs the failing step instead of pretending setup succeeded.

## What installation provisions and verifies

The frontend `postinstall` script runs `frontend/scripts/setup-ml.mjs` and `frontend/scripts/verify-ml.mjs`:

1. Selects Python 3.10–3.12 and creates or repairs `backend/.venv`.
2. Installs CPU-capable PyTorch and backend requirements (FastAPI/Uvicorn, Transformers, Piper, NumPy, HTTP clients, multipart upload support, and keyring); verifies imports and runs `pip check`.
3. Downloads and checks Whisper Tiny config/weights and both Piper voice/config pairs.
4. Runs an offline smoke test: synthesizes with both Piper voices, loads Whisper Tiny, and passes local Piper audio through Whisper. It is an install check, not a WER/accuracy benchmark.

`npm run dev` repeats provisioning checks and the offline inference smoke test **before starting Vite**. If any check fails, dev exits with the failing step and actionable logs; no dummy backend is substituted. To retry or repair provisioning, run `npm run setup:ml` from `frontend/`. The setup requires network access only for missing packages/models; speech itself is local and works offline afterward.

## Studio features

- **Record and transcribe:** Mic or audio upload; local Whisper Tiny; language selection; animated mic/playback wave.
- **Append segments:** Each microphone recording stops safely at two minutes. Choose **Add more audio** to record another part; newly transcribed words append to the existing transcript.
- **Restart session:** Saves the transcript in History, then clears the editor and current audio.
- **Refurbish with Gemini:** Generates a suggestion on click. Review it, export it, apply it, or discard it; the original text is not silently replaced.
- **Switchable voice search:** Speak a query; local Whisper turns it into editable text. Choose free, rate-limited Tavily keyless search for clean title/URL/snippet cards, or optionally ask Gemini to summarize those same results using ordinary text generation (no Google Search grounding). Tavily results are temporary in Forma and exportable; they and Gemini summaries are not added to History.
- **Session history:** Search, reopen, export, delete individual sessions, or clear all. Transcript text and metadata are saved in this browser only; audio is not archived.
- **Export:** Transcript, Gemini suggestion, individual search result, or session history in plain text (`.txt`), Markdown (`.md`), JSON, CSV, HTML, or print/save as PDF. Generated Piper speech can be downloaded as WAV. No timestamps are fabricated, so no SRT export is offered.
- Light and dark themes. Desktop has labelled side navigation; mobile uses a compact bottom navigation bar and no sidepane.

## Search providers, keys and privacy

Tavily provides web results without an API key; Gemini is optional for refurbishment and result summaries. Whisper/Piper remain local whether or not Gemini is configured.

- **Tavily keyless search** sends only the query to `https://api.tavily.com/search` after the user clicks Search, using Tavily's documented free, no-account, no-key mode. It returns structured result titles, URLs, and snippets; it is rate-limited and not guaranteed to be available. Tavily's [privacy policy](https://www.tavily.com/privacy) says query data may be retained as needed to provide and improve its services (it does not give a fixed number of days) and may be shared with third-party search-index providers in limited retrieval cases. Avoid personal or sensitive queries. Forma does not enable a paid plan or collect/store a Tavily key.
- **Gemini key** is entered in Settings and verified by the local Python backend, then saved in the OS credential vault (Windows Credential Manager on Windows). It is never returned to the UI or stored in browser storage. `FORMA_GEMINI_API_KEY` is supported for managed installs.
- **Refurbishment** sends transcript text only when its button is clicked. The suggestion is separate and requires review.
- **Gemini summary mode** first retrieves Tavily results, then sends the query plus up to eight returned titles, HTTPS URLs, and snippets (not full pages) to Gemini's normal text-generation endpoint after the user chooses the mode and clicks Search. Forma instructs Gemini to use only the supplied excerpts and cite the displayed Tavily sources. This consumes ordinary Gemini text tokens and project/model quotas; charges may apply. The feature does not invoke Google's separately priced Search-grounding or Google Agent Search APIs.
- Search audio is never uploaded. Search results and summaries are temporary and exportable, not stored in Forma History.
- Google's [unpaid-tier terms](https://ai.google.dev/gemini-api/terms#unpaid-services) allow submitted content and responses to be used to provide, improve, and develop Google products, including possible human review; [paid-tier terms](https://ai.google.dev/gemini-api/terms#paid-services) exclude product-improvement use. Google's [abuse-monitoring policy](https://ai.google.dev/gemini-api/docs/usage-policies) currently states that prompts, context, and outputs are retained for 55 days for safety enforcement. Review Google's linked data-use/retention policies before sending sensitive content.
- Gemini HTTP 429s retain Google's status, quota metric, and retry hint where supplied; check the exact project and model against Google's [rate-limit guide](https://ai.google.dev/gemini-api/docs/rate-limits). Tavily keyless limits are separate; wait and retry later, or use Tavily's optional free API-key plan (1,000 credits/month, no card). Forma itself remains keyless.

The in-app **Terms & privacy** page summarizes these local/cloud boundaries and links to current provider terms.

## Gemini models and pricing

The model picker includes stable text-generation models; preview-only and access-restricted legacy entries are omitted. Forma uses them for optional text refurbishment and Tavily-result summaries, never with Google's Search-grounding tool. **Gemini 3.5 Flash-Lite** is the fast, low-latency default; **Gemini 3.1 Flash-Lite** has the lowest text-token rates in the list. Availability, free quotas, and billing eligibility can vary by project, account, region, and current limits. Nigeria appears in Google's published [available regions](https://ai.google.dev/gemini-api/docs/available-regions).

Standard paid-tier rates below are from Google's pricing page, checked **10 October 2026**, in USD per million tokens. Free-tier text input/output is listed as free for these models, subject to quotas and Google's free-tier data-use terms.

| Stable model | Standard paid input | Standard paid output |
|---|---:|---:|
| `gemini-3.1-flash-lite` | $0.25 / 1M text input tokens | $1.50 / 1M output tokens |
| `gemini-3.5-flash-lite` | $0.30 / 1M input tokens | $2.50 / 1M output tokens |
| `gemini-3.6-flash` | $0.75 through 31 Dec 2026; $1.50 from 1 Jan 2027 | $3.75 through 31 Dec 2026; $7.50 from 1 Jan 2027 |
| `gemini-3.8-flash` | $0.75 through 31 Dec 2026; $1.50 from 1 Jan 2027 | $3.75 through 31 Dec 2026; $7.50 from 1 Jan 2027 |

Forma's search mode uses free, rate-limited Tavily for retrieval. Optional Gemini summaries use ordinary Gemini text-generation token rates. Google's separately priced Search-grounding tool is **not invoked**; its charges do not apply to Tavily searches performed by Forma. Check Google's live [pricing](https://ai.google.dev/gemini-api/docs/pricing) and [model availability](https://ai.google.dev/gemini-api/docs/models) pages before use.

Google's unpaid-tier terms allow submitted content and responses to be used to provide, improve, and develop Google products, including possible human review; paid-tier content is not used for product improvement. Google's abuse-monitoring policy currently states that prompts, context, and outputs are retained for 55 days for safety enforcement. Use Settings to choose stable models, and review Google's current terms, data-use, retention, and pricing policies before sending sensitive content.

## API

The Vite server proxies `/api/*` to the required local FastAPI service on port 8787. `npm run dev` provisions and smoke-tests the ML stack before Vite starts. If the backend later stops or becomes unhealthy, API requests return HTTP 503 with setup/log guidance—there is no stub speech backend or cloud speech fallback. The UI binds to loopback by default so saved API credentials are not exposed to the LAN; the Python backend also stays loopback-only and has CORS disabled. Arena preview deployments explicitly opt into their proxy host with `FORMA_PREVIEW_MODE=1`.

| Endpoint | Purpose |
|---|---|
| `GET /api/status` | Local Whisper/Piper asset readiness, model names, and load errors; no stub flag |
| `POST /api/transcribe` | Multipart WAV `audio` + `language` → transcript |
| `POST /api/synthesize` | JSON `text`, `voice`, `length_scale` → `audio/wav` |
| `GET /api/gemini/settings` | Key configured/vault availability (never returns the secret) |
| `POST /api/gemini/key` | Verify key, then store in OS credential vault |
| `DELETE /api/gemini/key` | Remove saved key from vault |
| `POST /api/gemini/refurbish` | Text improvement suggestion with selected stable model |
| `POST /api/tavily/search` | Free keyless Tavily web results, parsed into clean HTTPS title/URL/snippet cards |
| `POST /api/gemini/summarize-search` | Optional Gemini text-only summary of Tavily query plus result titles, HTTPS URLs, and snippets; no Search grounding tool |

The audio pipeline is ffmpeg-free: browser capture and upload decoding produce 16 kHz mono WAV for the local Whisper API.

## Configuration

| Variable | Purpose |
|---|---|
| `FORMA_MODELS_DIR` | Model cache directory (default `~/.cache/forma/models`) |
| `FORMA_STT_MODEL` | Local or Hugging Face STT model/checkpoint path |
| `FORMA_TTS_DIR` | Piper voice directory |
| `FORMA_GEMINI_API_KEY` | Optional environment-managed Gemini key |
| `FORMA_ML_PORT` | Local FastAPI port (default `8787`) |

The selected Gemini model and transcript history are browser preferences/data; the API key is not.

## Verification

From `frontend/`:

```bash
npm run build
npm run verify:ml
npm run dev                    # repeats setup + local inference checks before Vite starts
# in another terminal, while npm run dev is running:
node scripts/verify.mjs        # requires real local Whisper and Piper; fails if either is offline
node scripts/verify-mic.mjs
python ../backend/verify_search.py
```

`verify:ml` loads both Piper voices, runs local Piper synthesis, loads Whisper Tiny, and checks one local inference pass. The Playwright suite requires the real speech backend and checks the Piper→Whisper round trip, navigation, exports, history, mocked Tavily/Gemini results, Gemini 429 handling, and free search without a Gemini key. Backend search fixtures are network-free; they verify Tavily request/error handling and Gemini text generation without grounding. No test sends a live Tavily or Gemini request. Model-output checks are smoke tests, not WER scores.

## Project layout

```
backend/                   FastAPI services: Whisper, Piper, Gemini, Tavily keyless search
frontend/src/App.tsx        Page shell, studio workflow, history/session state
frontend/src/pages/         Voice search, session history, Settings, Terms & privacy
frontend/src/components/    Capture, transcript, output, export components
frontend/src/lib/            WAV, export, history, Gemini and Tavily API helpers
frontend/server/             Vite bridge to the required local ML backend (no stub)
frontend/scripts/             Strict ML setup/preflight and Playwright checks
backend/verify_ml.py           Offline Whisper + Piper installation smoke test
threeui/predictive-arc.json   Registered Predictive Arc bundle reference
```

## Design and provenance

- Main studio built around the exact registered **ThreeUI Predictive Arc** bundle (revision `fa86582fc870`); registered shader sources are integrity-protected and not edited.
- UI components: shadcn/ui and Magic UI; motion/wave visuals stay focused on the working studio, with promotional sections removed from the main page.
- Fragment Mono font carries the SIL Open Font License.

## Roadmap

Fine-tune Whisper Tiny on a suitable multilingual speech dataset and run a real Word Error Rate (WER) comparison against the pretrained checkpoint. `FORMA_STT_MODEL` is the checkpoint hook. WER and timing figures must be measured, never invented.

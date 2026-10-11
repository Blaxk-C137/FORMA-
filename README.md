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
- Python 3.10–3.12 recommended and available on PATH (`py -3` on Windows). Python 3.13 was exercised in the development environment; Windows compatibility may depend on current PyTorch/Piper wheels.
- About 700 MB of one-time model/runtime downloads, plus Node and Python development dependencies. Model weights live outside the repository in `~/.cache/forma/models` by default.
- Internet for installation/model downloads and when the user explicitly chooses Tavily search or Gemini features. Local Whisper/Piper speech works offline after setup.

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
| `POST /api/tavily/search` | Free keyless Tavily web results, parsed into clean HTTPS title/URL/snippet cards |
| `POST /api/gemini/summarize-search` | Optional Gemini text-only summary of Tavily query plus result titles, HTTPS URLs, and snippets; no Search grounding tool |

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
python ../backend/verify_search.py
```

The browser suite checks the real Piper→Whisper round trip when the backend is ready (otherwise it checks the explicitly labelled dummy result), plus navigation, exports, history, synthetic Tavily/Gemini summary results, Gemini 429 handling, and the free-search-without-Gemini behavior. Backend fixtures cover Tavily keyless request shape/rate-limit errors, ordinary Gemini `generateContent` without grounding tools, and summaries from supplied snippets without contacting either service. Mic tests use Playwright's fake microphone. Model outputs can vary, so transcription checks use tolerant text matching.

## Project layout

```
backend/                   FastAPI services: Whisper, Piper, Gemini, Tavily keyless search
frontend/src/App.tsx        Page shell, studio workflow, history/session state
frontend/src/pages/         Voice search, session history, Settings, Terms & privacy
frontend/src/components/    Capture, transcript, output, export components
frontend/src/lib/            WAV, export, history, Gemini and Tavily API helpers
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

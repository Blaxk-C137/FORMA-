import { AlertCircle, ExternalLink, Loader2, Mic, Search, ShieldCheck, Square, Volume2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AudioWave } from "@/components/AudioWave";
import { ExportMenu } from "@/components/ExportMenu";
import { Button } from "@/components/ui/button";
import { useSpeechApi } from "@/hooks/useSpeechApi";
import { runGoogleAgentSearch } from "@/lib/agentSearchApi";
import { runGeminiSearch } from "@/lib/geminiApi";
import { exportSearchResult, type ExportFormat } from "@/lib/export";
import { fileToWavBlob } from "@/lib/wav";

type VoiceSearchPageProps = {
  geminiConfigured: boolean;
  googleSearchConfigured: boolean;
  model: string;
  onGoToSettings: () => void;
  onToast: (message: string) => void;
};

type SearchProvider = "gemini" | "google";
type SearchCardSource = { title: string; uri: string; snippet?: string };
type SearchPageResult = {
  query: string;
  createdAt: string;
  provider: SearchProvider;
  text: string;
  model: string;
  sources: SearchCardSource[];
  queries: string[];
  search_entry_point?: string;
  total?: number;
};

const SEARCH_PROVIDER_KEY = "forma.search-provider.v1";
function readSearchProvider(): SearchProvider {
  try { return localStorage.getItem(SEARCH_PROVIDER_KEY) === "google" ? "google" : "gemini"; }
  catch { return "gemini"; }
}

function sourceDomain(uri: string): string {
  try { return new URL(uri).hostname; }
  catch { return uri; }
}

function GroundedAnswer({ text, sourceCount }: { text: string; sourceCount: number }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <div className="grounded-answer">
      {parts.map((part, index) => {
        const match = /^\[(\d+)\]$/.exec(part);
        const sourceNumber = match ? Number(match[1]) : 0;
        return sourceNumber > 0 && sourceNumber <= sourceCount
          ? <a className="grounding-citation" href={`#grounded-source-${sourceNumber}`} key={`${part}-${index}`}>{part}</a>
          : <span key={`text-${index}`}>{part}</span>;
      })}
    </div>
  );
}

function SearchSuggestions({ html }: { html: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !html) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    shadow.replaceChildren();
    const style = document.createElement("style");
    style.textContent = ":host{display:block;color:inherit;font:inherit} *{box-sizing:border-box} a{color:#7c55d9} ";
    shadow.append(style);
    const template = document.createElement("template");
    template.innerHTML = html;
    template.content.querySelectorAll("script,iframe,object,embed,form").forEach((node) => node.remove());
    template.content.querySelectorAll("*").forEach((element) => {
      [...element.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        if (name.startsWith("on") || name === "srcdoc") element.removeAttribute(attribute.name);
        if (name === "href") {
          try {
            if (new URL(attribute.value, window.location.href).protocol !== "https:") element.removeAttribute(attribute.name);
          } catch {
            element.removeAttribute(attribute.name);
          }
        }
      });
    });
    shadow.append(template.content.cloneNode(true));
  }, [html]);
  return <div className="google-search-suggestions" aria-label="Google Search suggestions" ref={hostRef} />;
}

export function VoiceSearchPage({ geminiConfigured, googleSearchConfigured, model, onGoToSettings, onToast }: VoiceSearchPageProps) {
  const { status, checking, transcribe } = useSpeechApi();
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<SearchProvider>(readSearchProvider);
  const [recording, setRecording] = useState(false);
  const [transcribingVoice, setTranscribingVoice] = useState(false);
  const [searching, setSearching] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [hint, setHint] = useState("Speak a question, place, or phrase. Whisper will recognize it locally.");
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [result, setResult] = useState<SearchPageResult | null>(null);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef(0);
  const startRef = useRef(0);
  const recordingRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recordingRef.current = false;
      clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(SEARCH_PROVIDER_KEY, provider); }
    catch { /* the provider preference is non-secret */ }
  }, [provider]);

  const transcribeVoice = useCallback(async (blob: Blob) => {
    if (!status?.stt_ready) {
      setHint("Local Whisper is not ready yet. Start the real backend or type the query instead.");
      setTranscribingVoice(false);
      return;
    }
    setTranscribingVoice(true);
    setHint("Recognizing speech locally…");
    try {
      const wav = await fileToWavBlob(blob);
      const recognized = await transcribe(wav, "voice-search.wav", "auto");
      if (!mountedRef.current) return;
      if (recognized.ok) {
        setQuery(recognized.data.text);
        setHint("Voice query recognized locally. Review it, then click Search.");
        onToast("Voice query ready. Nothing has been sent to Gemini yet.");
      } else {
        setHint(recognized.error);
      }
    } catch {
      setHint("Could not decode that recording. Try again or type your query.");
    } finally {
      if (mountedRef.current) setTranscribingVoice(false);
    }
  }, [onToast, status?.stt_ready, transcribe]);

  const stopRecording = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    clearInterval(tickRef.current);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (!status?.stt_ready) {
      setHint(checking ? "Checking the local Whisper backend…" : "Local Whisper is offline. You can still type a search query.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setHint("Microphone recording needs HTTPS or localhost and a supported browser. Type your query instead.");
      return;
    }
    try {
      setError("");
      setHint("Waiting for microphone permission…");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (mountedRef.current) setLiveStream(null);
        if (blob.size) void transcribeVoice(blob);
      };
      recorder.start(200);
      recordingRef.current = true;
      setLiveStream(stream);
      setElapsed(0);
      setRecording(true);
      setHint("Recording a short search query. Stop to transcribe it on this device.");
      startRef.current = performance.now();
      tickRef.current = window.setInterval(() => {
        const next = performance.now() - startRef.current;
        setElapsed(next);
        if (next >= 60_000) stopRecording();
      }, 100);
    } catch (reason) {
      const name = (reason as DOMException)?.name;
      setHint(name === "NotAllowedError" ? "Microphone permission denied. Allow access or type your query." : "Could not open the microphone. Type your query instead.");
    }
  }, [checking, status?.stt_ready, stopRecording, transcribeVoice]);

  const handleSearch = async (event?: FormEvent) => {
    event?.preventDefault();
    const cleaned = query.trim();
    if (!cleaned) return;
    if (provider === "gemini" && !geminiConfigured) {
      setError("Add a Gemini API key in Settings before using Gemini grounded search.");
      return;
    }
    if (provider === "google" && !googleSearchConfigured) {
      setError("Set up Google Agent Search in Settings before using direct Google results.");
      return;
    }
    setSearching(true);
    setError("");
    setResult(null);
    try {
      const createdAt = new Date().toISOString();
      if (provider === "gemini") {
        const response = await runGeminiSearch(cleaned, model);
        setResult({ ...response, query: cleaned, createdAt, provider: "gemini" });
        setHint("Gemini's grounded answer is ready. Citation-linked sources and Google's Search Suggestions are shown below.");
      } else {
        const response = await runGoogleAgentSearch(cleaned);
        setResult({
          query: cleaned,
          createdAt,
          provider: "google",
          text: "",
          model: "Google Agent Search",
          sources: response.results,
          queries: [],
          total: response.total,
        });
        setHint("Google Agent Search returned direct results from the sites indexed by your configured app.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  const timer = `${String(Math.floor(elapsed / 60000)).padStart(2, "0")}:${String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0")}`;

  return (
    <div className="page-stack">
      <div className="page-heading-row">
        <div><div className="eyebrow"><Search className="h-3.5 w-3.5" /> VOICE SEARCH</div><h1 className="page-title">Ask the web<span className="text-violet">.</span></h1><p className="page-subtitle">Speak your query; local Whisper transcribes it, then choose a grounded Gemini answer or direct Google site results.</p></div>
      </div>

      <section className="search-compose settings-card">
        <div className="search-mic-row">
          <div className={`search-wave ${recording ? "is-live" : ""}`}><AudioWave stream={liveStream} height={60} /></div>
          <Button variant={recording ? "destructive" : "outline"} onClick={() => recording ? stopRecording() : void startRecording()} disabled={transcribingVoice || searching} className="gap-2">
            {transcribingVoice ? <Loader2 className="h-4 w-4 animate-spin" /> : recording ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
            {transcribingVoice ? "Transcribing locally…" : recording ? `Stop · ${timer}` : "Speak a query"}
          </Button>
        </div>
        <div className="search-provider-row">
          <label htmlFor="search-provider" className="field-label">Search engine</label>
          <select id="search-provider" className="select-control model-select" value={provider} disabled={searching} onChange={(event) => { setProvider(event.target.value as SearchProvider); setError(""); setResult(null); }}>
            <option value="gemini">Gemini · Google Search grounded answer</option>
            <option value="google">Google Agent Search · direct result cards</option>
          </select>
          <p className="field-help">Gemini grounds an AI answer in Google Search. Google Agent Search returns direct title/snippet results from the public sites configured in your Cloud search app.</p>
        </div>
        <form className="search-form" onSubmit={(event) => void handleSearch(event)}>
          <label htmlFor="voice-search-query" className="field-label">Search query</label>
          <textarea id="voice-search-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What would you like to find out?" rows={3} maxLength={2000} />
          <div className="search-form-bottom"><span>{hint}</span><span>{query.length}/2,000</span></div>
          <div className="search-form-actions">
            {!(provider === "gemini" ? geminiConfigured : googleSearchConfigured) ? <Button type="button" variant="outline" onClick={onGoToSettings}>Set up {provider === "gemini" ? "Gemini" : "Google Agent Search"} in Settings</Button> : null}
            <Button type="submit" disabled={!query.trim() || !(provider === "gemini" ? geminiConfigured : googleSearchConfigured) || searching || recording || transcribingVoice} className="gap-2">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{searching ? "Searching…" : "Search the web"}
            </Button>
          </div>
        </form>
        <div className="privacy-callout"><ShieldCheck className="h-4 w-4 shrink-0 text-violet" /><p>{provider === "gemini" ? <>The recording is transcribed locally. After you click <strong>Search the web</strong>, only the query text is sent to Gemini with Google Search grounding. Gemini 3 Search grounding is not available on the Gemini API free tier; paid-tier billing and grounding quota may be required.</> : <>The recording is transcribed locally. After you click <strong>Search the web</strong>, the query is sent to Google Cloud Agent Search. Results come from the sites in your configured Search app; Cloud quotas and charges can apply.</>}</p></div>
      </section>

      {error ? <div className="form-error search-error" role="alert"><AlertCircle className="h-4 w-4 shrink-0" /><span>{error}{error.includes("HTTP 429") ? provider === "gemini" ? <> <a className="external-link" href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank" rel="noreferrer">Gemini rate-limit details</a> · <a className="external-link" href="https://ai.google.dev/gemini-api/docs/google-search" target="_blank" rel="noreferrer">Search grounding limits</a></> : <> <a className="external-link" href="https://console.cloud.google.com/iam-admin/quotas" target="_blank" rel="noreferrer">Google Cloud quotas</a> · <a className="external-link" href="https://cloud.google.com/generative-ai-app-builder/pricing" target="_blank" rel="noreferrer">Agent Search pricing</a></> : null}</span></div> : null}

      {result ? (
        <section className="search-result settings-card" aria-live="polite">
          <div className="search-result-head"><div><div className="eyebrow">{result.provider === "gemini" ? "GROUNDED ANSWER" : "GOOGLE RESULTS"}</div><h2>{result.query}</h2><span className="search-result-meta">{new Date(result.createdAt).toLocaleString()} · {result.provider === "gemini" ? result.model : `${result.sources.length} shown of ${result.total ?? result.sources.length}`}</span></div><ExportMenu label="Export result" onExport={(format: ExportFormat) => exportSearchResult({ query: result.query, text: result.text, provider: result.provider === "gemini" ? "Gemini Search grounding" : "Google Agent Search", model: result.model, total: result.total, createdAt: result.createdAt, sources: result.sources }, format)} /></div>
          {result.provider === "gemini" ? <>
            <GroundedAnswer text={result.text} sourceCount={result.sources.length} />
            <div className="grounded-sources"><h3>Sources</h3>{result.sources.length ? <ol>{result.sources.map((source, index) => <li id={`grounded-source-${index + 1}`} key={`${source.uri}-${index}`}><span className="source-number">{index + 1}</span><a href={source.uri} target="_blank" rel="noopener noreferrer">{source.title || source.uri}<ExternalLink className="h-3 w-3" /></a></li>)}</ol> : <p>No source URLs were provided for this answer. Treat it as unverified.</p>}</div>
            {result.queries.length ? <p className="search-query-note">Google searches used: {result.queries.join(" · ")}</p> : null}
            {result.search_entry_point ? <div className="suggestions-wrap"><p className="field-label">Google Search suggestions</p><SearchSuggestions html={result.search_entry_point} /></div> : null}
          </> : <div className="agent-search-results"><h3>Direct results from your indexed sites</h3>{result.sources.length ? <ol>{result.sources.map((source, index) => <li className="agent-result-card" key={`${source.uri}-${index}`}><span className="source-number">{index + 1}</span><div><a href={source.uri} target="_blank" rel="noopener noreferrer">{source.title || source.uri}<ExternalLink className="h-3 w-3" /></a><div className="agent-result-domain">{sourceDomain(source.uri)}</div>{source.snippet ? <p>{source.snippet}</p> : <p className="agent-result-empty">Google did not return a snippet for this page.</p>}</div></li>)}</ol> : <p>No matching pages were returned from the sites indexed by this Agent Search app.</p>}</div>}
          <div className="search-result-foot"><Volume2 className="h-3.5 w-3.5" /> This individual result is temporary in Forma. Export it yourself if you want to keep a copy; it is not added to session history.</div>
        </section>
      ) : null}

      <p className="page-footnote">{status?.stub ? "Speech input is running in clearly-labelled dummy mode." : "Search results are not stored in browser history. Leaving this page clears the result."} {status?.stt_ready ? "Local Whisper is ready." : checking ? "Checking Whisper…" : "Type a query if the local microphone backend is unavailable."}</p>
    </div>
  );
}

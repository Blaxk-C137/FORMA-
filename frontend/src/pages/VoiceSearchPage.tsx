import { AlertCircle, ExternalLink, Loader2, Mic, Search, ShieldCheck, Square, Volume2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AudioWave } from "@/components/AudioWave";
import { ExportMenu } from "@/components/ExportMenu";
import { Button } from "@/components/ui/button";
import { useSpeechApi } from "@/hooks/useSpeechApi";
import { summarizeTavilyResults } from "@/lib/geminiApi";
import { runTavilySearch, type SearchSource } from "@/lib/tavilyApi";
import { exportSearchResult, type ExportFormat } from "@/lib/export";
import { fileToWavBlob } from "@/lib/wav";

type VoiceSearchPageProps = {
  geminiConfigured: boolean;
  model: string;
  onGoToSettings: () => void;
  onToast: (message: string) => void;
};

type SearchProvider = "tavily" | "gemini";
type SearchPageResult = {
  query: string;
  createdAt: string;
  provider: SearchProvider;
  text: string;
  model: string;
  sources: SearchSource[];
  total: number;
};

const SEARCH_PROVIDER_KEY = "forma.search-provider.v2";
function readSearchProvider(): SearchProvider {
  try { return localStorage.getItem(SEARCH_PROVIDER_KEY) === "gemini" ? "gemini" : "tavily"; }
  catch { return "tavily"; }
}

function sourceDomain(uri: string): string {
  try { return new URL(uri).hostname; }
  catch { return uri; }
}

function CitedSummary({ text, sourceCount }: { text: string; sourceCount: number }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <div className="cited-summary">
      {parts.map((part, index) => {
        const match = /^\[(\d+)\]$/.exec(part);
        const sourceNumber = match ? Number(match[1]) : 0;
        return sourceNumber > 0 && sourceNumber <= sourceCount
          ? <a className="source-citation" href={`#search-source-${sourceNumber}`} key={`${part}-${index}`}>{part}</a>
          : <span key={`text-${index}`}>{part}</span>;
      })}
    </div>
  );
}

export function VoiceSearchPage({ geminiConfigured, model, onGoToSettings, onToast }: VoiceSearchPageProps) {
  const { status, checking, transcribe } = useSpeechApi();
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<SearchProvider>(readSearchProvider);
  const [recording, setRecording] = useState(false);
  const [transcribingVoice, setTranscribingVoice] = useState(false);
  const [searching, setSearching] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [hint, setHint] = useState("Speak a query; Whisper recognizes it locally. Search results are provided by free, rate-limited Tavily.");
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
        onToast("Voice query ready. Nothing has been sent to web search yet.");
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
      setError("Add a Gemini API key in Settings before requesting a Gemini summary.");
      return;
    }
    setSearching(true);
    setError("");
    setResult(null);
    let directResult: SearchPageResult | null = null;
    try {
      const createdAt = new Date().toISOString();
      const response = await runTavilySearch(cleaned);
      directResult = {
        query: cleaned,
        createdAt,
        provider: "tavily",
        text: "",
        model: "Tavily keyless search",
        sources: response.results,
        total: response.total,
      };
      if (provider === "tavily") {
        setResult(directResult);
        setHint(`Tavily returned ${response.results.length} results. Keyless access is free and rate-limited.`);
        return;
      }

      // Preserve and show the free result cards even if Gemini summary is quota-limited.
      setResult(directResult);
      setHint("Tavily results are ready. Asking Gemini for a summary using only these snippets…");
      const summary = await summarizeTavilyResults(cleaned, response.results, model);
      setResult({ ...directResult, provider: "gemini", text: summary.text, model: summary.model });
      setHint("Gemini summarized Tavily's results. Sources below are the Tavily pages supplied to the model.");
    } catch (reason) {
      if (provider === "gemini" && directResult) setResult(directResult);
      setError(reason instanceof Error ? reason.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  const timer = `${String(Math.floor(elapsed / 60000)).padStart(2, "0")}:${String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0")}`;

  return (
    <div className="page-stack">
      <div className="page-heading-row">
        <div><div className="eyebrow"><Search className="h-3.5 w-3.5" /> VOICE SEARCH</div><h1 className="page-title">Ask the web<span className="text-violet">.</span></h1><p className="page-subtitle">Speak your query; local Whisper transcribes it. Tavily fetches free, structured web results; Gemini is optional for a summary.</p></div>
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
            <option value="tavily">Tavily · free web results</option>
            <option value="gemini">Gemini · summarize Tavily results</option>
          </select>
          <p className="field-help">Both modes retrieve the same results from Tavily. Gemini mode additionally sends the query and the returned titles, URLs, and snippets (not full pages) to Gemini for a cited summary using ordinary text generation, not Google Search grounding.</p>
        </div>
        <form className="search-form" onSubmit={(event) => void handleSearch(event)}>
          <label htmlFor="voice-search-query" className="field-label">Search query</label>
          <textarea id="voice-search-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What would you like to find out?" rows={3} maxLength={2000} />
          <div className="search-form-bottom"><span>{hint}</span><span>{query.length}/2,000</span></div>
          <div className="search-form-actions">
            {provider === "gemini" && !geminiConfigured ? <Button type="button" variant="outline" onClick={onGoToSettings}>Set up Gemini in Settings</Button> : null}
            <Button type="submit" disabled={!query.trim() || (provider === "gemini" && !geminiConfigured) || searching || recording || transcribingVoice} className="gap-2">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{searching ? "Searching…" : "Search the web"}
            </Button>
          </div>
        </form>
        <div className="privacy-callout"><ShieldCheck className="h-4 w-4 shrink-0 text-violet" /><p>{provider === "gemini" ? <>After you click <strong>Search the web</strong>, the query goes to Tavily; if Gemini summary is selected, the query plus returned titles, URLs, and snippets (not full pages) go to Google. Tavily and Google's retention/data-use policies apply; Google's abuse-monitoring policy currently states 55-day retention. Gemini quotas and token charges may apply. This uses ordinary text generation, not Google Search grounding.</> : <>After you click <strong>Search the web</strong>, only the query goes to Tavily's free, keyless search API. It is rate-limited; Tavily may retain query data as needed and share it with search-index providers in limited cases. Avoid sensitive searches. Audio stays local.</>}</p></div>
      </section>

      {error ? <div className="form-error search-error" role="alert"><AlertCircle className="h-4 w-4 shrink-0" /><span>{error}{error.toLowerCase().includes("tavily") ? <> <a className="external-link" href="https://docs.tavily.com/documentation/keyless" target="_blank" rel="noreferrer">Tavily keyless limits and free access</a></> : error.includes("HTTP 429") ? <> <a className="external-link" href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank" rel="noreferrer">Gemini rate-limit details</a></> : null}</span></div> : null}

      {result ? (
        <section className="search-result settings-card" aria-live="polite">
          <div className="search-result-head"><div><div className="eyebrow">{result.provider === "gemini" ? "GEMINI SUMMARY · TAVILY SOURCES" : "TAVILY WEB RESULTS"}</div><h2>{result.query}</h2><span className="search-result-meta">{new Date(result.createdAt).toLocaleString()} · {result.sources.length} result{result.sources.length === 1 ? "" : "s"} · {result.provider === "gemini" ? result.model : "free keyless search"}</span></div><ExportMenu label="Export result" onExport={(format: ExportFormat) => exportSearchResult({ query: result.query, text: result.text, provider: result.provider === "gemini" ? "Gemini summary using Tavily" : "Tavily keyless search", model: result.model, total: result.total, createdAt: result.createdAt, sources: result.sources }, format)} /></div>
          {result.provider === "gemini" ? <>
            <CitedSummary text={result.text} sourceCount={result.sources.length} />
            <div className="search-sources"><h3>Search sources</h3>{result.sources.length ? <ol>{result.sources.map((source, index) => <li id={`search-source-${index + 1}`} key={`${source.uri}-${index}`}><span className="source-number">{index + 1}</span><a href={source.uri} target="_blank" rel="noopener noreferrer">{source.title || source.uri}<ExternalLink className="h-3 w-3" /></a>{source.snippet ? <p>{source.snippet}</p> : null}</li>)}</ol> : <p>No source links were returned by Tavily. Treat this summary as unverified.</p>}</div>
            <p className="search-query-note">Gemini summarized the Tavily snippets shown above. Verify important claims on the original pages.</p>
          </> : <div className="web-search-results"><h3>Direct results from Tavily</h3>{result.sources.length ? <ol>{result.sources.map((source, index) => <li className="web-result-card" key={`${source.uri}-${index}`}><span className="source-number">{index + 1}</span><div><a href={source.uri} target="_blank" rel="noopener noreferrer">{source.title || source.uri}<ExternalLink className="h-3 w-3" /></a><div className="web-result-domain">{sourceDomain(source.uri)}</div>{source.snippet ? <p>{source.snippet}</p> : <p className="web-result-empty">No snippet was returned for this page.</p>}</div></li>)}</ol> : <p>Tavily returned no results for this query.</p>}</div>}
          <div className="search-result-foot"><Volume2 className="h-3.5 w-3.5" /> This individual result is temporary in Forma. Export it yourself if you want to keep a copy; it is not added to session history.</div>
        </section>
      ) : null}

      <p className="page-footnote">{status?.stub ? "Speech input is running in clearly-labelled dummy mode." : "Search results are not stored in browser history. Leaving this page clears the result."} {status?.stt_ready ? "Local Whisper is ready." : checking ? "Checking Whisper…" : "Type a query if the local microphone backend is unavailable."}</p>
    </div>
  );
}

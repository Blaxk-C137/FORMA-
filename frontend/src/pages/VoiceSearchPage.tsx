import { AlertCircle, ExternalLink, Loader2, Mic, Search, ShieldCheck, Square, Volume2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AudioWave } from "@/components/AudioWave";
import { ExportMenu } from "@/components/ExportMenu";
import { Button } from "@/components/ui/button";
import { useSpeechApi } from "@/hooks/useSpeechApi";
import { runGeminiSearch, type GeminiSearchResult } from "@/lib/geminiApi";
import { exportSearchResult, type ExportFormat, type SearchExport } from "@/lib/export";
import { fileToWavBlob } from "@/lib/wav";

type VoiceSearchPageProps = {
  geminiConfigured: boolean;
  model: string;
  onGoToSettings: () => void;
  onToast: (message: string) => void;
};

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

export function VoiceSearchPage({ geminiConfigured, model, onGoToSettings, onToast }: VoiceSearchPageProps) {
  const { status, checking, transcribe } = useSpeechApi();
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribingVoice, setTranscribingVoice] = useState(false);
  const [searching, setSearching] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [hint, setHint] = useState("Speak a question, place, or phrase. Whisper will recognize it locally.");
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [result, setResult] = useState<(GeminiSearchResult & { query: string; createdAt: string }) | null>(null);
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
    if (!geminiConfigured) {
      setError("Add a Gemini API key in Settings before searching the web.");
      return;
    }
    setSearching(true);
    setError("");
    setResult(null);
    try {
      const response = await runGeminiSearch(cleaned, model);
      setResult({ ...response, query: cleaned, createdAt: new Date().toISOString() });
      setHint("Grounded answer ready. Sources and Google's associated Search Suggestions are shown below.");
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
        <div><div className="eyebrow"><Search className="h-3.5 w-3.5" /> VOICE SEARCH</div><h1 className="page-title">Ask the web<span className="text-violet">.</span></h1><p className="page-subtitle">Speak your query; local Whisper transcribes it, then Gemini searches and cites live web sources.</p></div>
      </div>

      <section className="search-compose settings-card">
        <div className="search-mic-row">
          <div className={`search-wave ${recording ? "is-live" : ""}`}><AudioWave stream={liveStream} height={60} /></div>
          <Button variant={recording ? "destructive" : "outline"} onClick={() => recording ? stopRecording() : void startRecording()} disabled={transcribingVoice || searching} className="gap-2">
            {transcribingVoice ? <Loader2 className="h-4 w-4 animate-spin" /> : recording ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
            {transcribingVoice ? "Transcribing locally…" : recording ? `Stop · ${timer}` : "Speak a query"}
          </Button>
        </div>
        <form className="search-form" onSubmit={(event) => void handleSearch(event)}>
          <label htmlFor="voice-search-query" className="field-label">Search query</label>
          <textarea id="voice-search-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What would you like to find out?" rows={3} maxLength={2000} />
          <div className="search-form-bottom"><span>{hint}</span><span>{query.length}/2,000</span></div>
          <div className="search-form-actions">
            {!geminiConfigured ? <Button type="button" variant="outline" onClick={onGoToSettings}>Set up Gemini in Settings</Button> : null}
            <Button type="submit" disabled={!query.trim() || !geminiConfigured || searching || recording || transcribingVoice} className="gap-2">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{searching ? "Searching the web…" : "Search the web"}
            </Button>
          </div>
        </form>
        <div className="privacy-callout"><ShieldCheck className="h-4 w-4 shrink-0 text-violet" /><p>The recording is transcribed locally. Only after you click <strong>Search the web</strong> is the query sent to Google. Search grounding may require a paid-tier Gemini API project and can incur charges.</p></div>
      </section>

      {error ? <div className="form-error search-error" role="alert"><AlertCircle className="h-4 w-4" />{error}</div> : null}

      {result ? (
        <section className="search-result settings-card" aria-live="polite">
          <div className="search-result-head"><div><div className="eyebrow">GROUNDED RESULT</div><h2>{result.query}</h2><span className="search-result-meta">{new Date(result.createdAt).toLocaleString()} · {result.model}</span></div><ExportMenu label="Export result" onExport={(format: ExportFormat) => exportSearchResult({ query: result.query, text: result.text, model: result.model, createdAt: result.createdAt, sources: result.sources } satisfies SearchExport, format)} /></div>
          <GroundedAnswer text={result.text} sourceCount={result.sources.length} />
          <div className="grounded-sources"><h3>Sources</h3>{result.sources.length ? <ol>{result.sources.map((source, index) => <li id={`grounded-source-${index + 1}`} key={`${source.uri}-${index}`}><span className="source-number">{index + 1}</span><a href={source.uri} target="_blank" rel="noopener noreferrer">{source.title || source.uri}<ExternalLink className="h-3 w-3" /></a></li>)}</ol> : <p>No source URLs were provided for this answer. Treat it as unverified.</p>}</div>
          {result.queries.length ? <p className="search-query-note">Google searches used: {result.queries.join(" · ")}</p> : null}
          {result.search_entry_point ? <div className="suggestions-wrap"><p className="field-label">Google Search suggestions</p><SearchSuggestions html={result.search_entry_point} /></div> : null}
          <div className="search-result-foot"><Volume2 className="h-3.5 w-3.5" /> This individual result is temporary in Forma. Export it yourself if you want to keep a copy; it is not added to session history.</div>
        </section>
      ) : null}

      <p className="page-footnote">{status?.stub ? "Speech input is running in clearly-labelled dummy mode." : "Search results are not stored in browser history. Leaving this page clears the result."} {status?.stt_ready ? "Local Whisper is ready." : checking ? "Checking Whisper…" : "Type a query if the local microphone backend is unavailable."}</p>
    </div>
  );
}

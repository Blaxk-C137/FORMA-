import {
  AudioLines,
  Clock3,
  RotateCcw,
  ScrollText,
  Search,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CaptureCard } from "@/components/CaptureCard";
import { SpeechPanel } from "@/components/SpeechPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TranscriptCard } from "@/components/TranscriptCard";
import { useSpeechApi } from "@/hooks/useSpeechApi";
import { getGoogleAgentSearchSettings, type GoogleAgentSearchSettings } from "@/lib/agentSearchApi";
import { getGeminiSettings, refurbishText, type GeminiSettings } from "@/lib/geminiApi";
import { exportSessions, exportTranscript, type ExportFormat } from "@/lib/export";
import { clearActiveSession, formatSessionTitle, persistHistory, persistSession, readActiveSession, readHistory, sessionWordCount, type SessionRecord } from "@/lib/history";
import { readGeminiModel, GEMINI_MODEL_STORAGE_KEY } from "@/lib/geminiModels";
import { HistoryPage } from "@/pages/HistoryPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { TermsPage } from "@/pages/TermsPage";
import { VoiceSearchPage } from "@/pages/VoiceSearchPage";

type Page = "studio" | "search" | "history" | "settings" | "terms";
type AudioSegment = { blob: Blob; apiBlob: Blob; name: string };

const NAV: { id: Page; label: string; Icon: typeof AudioLines }[] = [
  { id: "studio", label: "Voice studio", Icon: AudioLines },
  { id: "search", label: "Voice search", Icon: Search },
  { id: "history", label: "Session history", Icon: Clock3 },
  { id: "settings", label: "Settings", Icon: Settings2 },
  { id: "terms", label: "Terms & privacy", Icon: ScrollText },
];

function getPageFromHash(): Page {
  const value = window.location.hash.replace(/^#\/?/, "").split("/")[0];
  return NAV.some((item) => item.id === value) ? value as Page : "studio";
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeRecord(input: {
  id: string;
  startedAt: string;
  transcript: string;
  textStatus: string;
  segmentCount: number;
}): SessionRecord {
  const now = new Date().toISOString();
  return {
    id: input.id,
    startedAt: input.startedAt,
    updatedAt: now,
    title: formatSessionTitle(input.transcript, input.segmentCount, input.startedAt),
    transcript: input.transcript,
    textStatus: input.textStatus,
    segmentCount: input.segmentCount,
  };
}

export default function App() {
  const initial = readActiveSession();
  const [page, setPage] = useState<Page>(() => getPageFromHash());
  const [transcript, setTranscript] = useState(initial?.transcript ?? "");
  const [transcribedCount, setTranscribedCount] = useState(0);
  const [audioSegments, setAudioSegments] = useState<AudioSegment[]>([]);
  const [audioName, setAudioName] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [refurbishing, setRefurbishing] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [textStatus, setTextStatus] = useState(initial?.textStatus ?? "Ready for your words");
  const [note, setNote] = useState("Choose a local Piper voice to hear your text.");
  const [toast, setToast] = useState("");
  const [history, setHistory] = useState<SessionRecord[]>(() => readHistory());
  const [sessionId, setSessionId] = useState(initial?.id ?? newId());
  const [sessionStartedAt, setSessionStartedAt] = useState(initial?.startedAt ?? new Date().toISOString());
  // History keeps metadata only; captured audio itself is deliberately not persisted.
  const [sessionSegmentBase, setSessionSegmentBase] = useState(initial?.segmentCount ?? 0);
  const [sessionToken, setSessionToken] = useState(0);
  const [geminiSettings, setGeminiSettings] = useState<GeminiSettings | null>(null);
  const [agentSearchSettings, setAgentSearchSettings] = useState<GoogleAgentSearchSettings | null>(null);
  const [geminiModel, setGeminiModel] = useState(readGeminiModel);
  const { status, checking, transcribe, synthesize } = useSpeechApi();

  const transcriptRef = useRef(transcript);
  const audioSegmentsRef = useRef<AudioSegment[]>([]);
  const transcribedCountRef = useRef(0);
  const sessionTokenRef = useRef(0);
  const audioUrlRef = useRef<string | null>(null);
  const outUrlRef = useRef<string | null>(null);
  const toastTimer = useRef(0);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3600);
  }, []);

  const onGeminiRefresh = useCallback((settings: GeminiSettings) => setGeminiSettings(settings), []);
  const onAgentSearchRefresh = useCallback((settings: GoogleAgentSearchSettings) => setAgentSearchSettings(settings), []);

  useEffect(() => {
    const refresh = async () => {
      try { setGeminiSettings(await getGeminiSettings()); }
      catch { setGeminiSettings({ configured: false, vault_available: false, model_default: "gemini-3.5-flash-lite" }); }
      try { setAgentSearchSettings(await getGoogleAgentSearchSettings()); }
      catch { setAgentSearchSettings({ configured: false, vault_available: false, key_source: null, project_id: "", engine_id: "", location: "global" }); }
    };
    void refresh();
  }, []);

  useEffect(() => {
    const handleHash = () => setPage(getPageFromHash());
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(GEMINI_MODEL_STORAGE_KEY, geminiModel); } catch { /* storage disabled */ }
  }, [geminiModel]);

  useEffect(() => {
    transcriptRef.current = transcript;
    audioSegmentsRef.current = audioSegments;
    transcribedCountRef.current = transcribedCount;
  }, [audioSegments, sessionId, sessionSegmentBase, sessionStartedAt, textStatus, transcript, transcribedCount]);

  useEffect(() => {
    if (!transcript.trim() && !audioSegments.length && !sessionSegmentBase) {
      clearActiveSession();
      return;
    }
    const timer = window.setTimeout(() => {
      const record = makeRecord({ id: sessionId, startedAt: sessionStartedAt, transcript, textStatus, segmentCount: sessionSegmentBase + audioSegments.length });
      setHistory(persistSession(record));
    }, 260);
    return () => window.clearTimeout(timer);
  }, [audioSegments.length, sessionId, sessionSegmentBase, sessionStartedAt, textStatus, transcript]);

  useEffect(() => () => {
    window.clearTimeout(toastTimer.current);
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current);
  }, []);

  const navigate = useCallback((next: Page) => {
    setPage(next);
    const hash = `#/${next}`;
    if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
  }, []);

  const handleCapture = useCallback((blob: Blob, name: string, apiBlob: Blob, token: number) => {
    if (token !== sessionTokenRef.current) return;
    const item = { blob, name, apiBlob };
    const next = [...audioSegmentsRef.current, item];
    audioSegmentsRef.current = next;
    setAudioSegments(next);
    setAudioName(name);
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = URL.createObjectURL(blob);
    audioUrlRef.current = url;
    setAudioUrl(url);
    setTextStatus((previous) => previous === "Ready for your words" ? "Audio captured · ready to transcribe" : previous);
    showToast(`Audio part ${next.length} added to this session.`);
  }, [showToast]);

  const handleTranscriptChange = useCallback((next: string) => {
    transcriptRef.current = next;
    setTranscript(next);
  }, []);

  const handleTranscribe = useCallback(async (language: string) => {
    if (!status?.stt_ready) {
      showToast(checking ? "Checking the local speech engine…" : "Local Whisper is not ready. Check setup; no cloud speech fallback is used.");
      return;
    }
    const operationToken = sessionTokenRef.current;
    const queue = audioSegmentsRef.current;
    const startAt = transcribedCountRef.current;
    if (startAt >= queue.length) return;
    setTranscribing(true);
    let appended = 0;
    for (let index = startAt; index < queue.length; index++) {
      const segment = queue[index];
      const response = await transcribe(segment.apiBlob, `${segment.name.replace(/\s+/g, "-")}.wav`, language);
      if (operationToken !== sessionTokenRef.current) return;
      if (!response.ok) {
        showToast(response.error);
        break;
      }
      const nextPart = response.data.text.trim();
      const current = transcriptRef.current.trimEnd();
      const merged = [current, nextPart].filter(Boolean).join(current && nextPart ? "\n\n" : "");
      transcriptRef.current = merged;
      setTranscript(merged);
      transcribedCountRef.current = index + 1;
      setTranscribedCount(index + 1);
      appended += 1;
      setTextStatus(status.stub ? "Stub transcription · dummy backend" : "Transcribed locally with Whisper");
    }
    setTranscribing(false);
    if (appended) showToast(`${appended} new ${appended === 1 ? "part" : "parts"} transcribed and appended.`);
  }, [checking, showToast, status, transcribe]);

  const handleRefurbish = useCallback(async () => {
    const text = transcriptRef.current.trim();
    if (!text) return;
    if (!geminiSettings?.configured) {
      navigate("settings");
      showToast("Add your Gemini key in Settings first.");
      return;
    }
    const operationToken = sessionTokenRef.current;
    setRefurbishing(true);
    setSuggestion("");
    try {
      const result = await refurbishText(text, geminiModel);
      if (operationToken !== sessionTokenRef.current) return;
      setSuggestion(result);
      showToast("Gemini prepared a suggestion. Review it before applying.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gemini refurbishment failed.");
    } finally {
      setRefurbishing(false);
    }
  }, [geminiModel, geminiSettings?.configured, navigate, showToast]);

  const handleSpeak = useCallback(async (voice: string, pace: number) => {
    const text = transcriptRef.current.trim();
    if (!text) return;
    if (!status?.tts_ready) {
      showToast("Local Piper is not ready. No cloud text-to-speech fallback is used.");
      return;
    }
    const operationToken = sessionTokenRef.current;
    setSpeaking(true);
    setNote("Generating speech locally…");
    const response = await synthesize(text, voice, pace);
    if (operationToken !== sessionTokenRef.current) return;
    setSpeaking(false);
    if (!response.ok) {
      showToast(response.error);
      setNote("Generation failed. Try again.");
      return;
    }
    if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current);
    const url = URL.createObjectURL(response.data.audio);
    outUrlRef.current = url;
    setOutUrl(url);
    setNote(status.stub ? "Dummy tone generated (stub), not speech." : "Your local audio is ready.");
  }, [showToast, status, synthesize]);

  const saveActiveSessionNow = useCallback(() => {
    const current = {
      id: sessionId,
      startedAt: sessionStartedAt,
      transcript: transcriptRef.current,
      textStatus,
      segmentCount: sessionSegmentBase + audioSegmentsRef.current.length,
    };
    if (!current.transcript.trim() && !current.segmentCount) return;
    const record = makeRecord(current);
    setHistory(persistSession(record));
  }, [sessionId, sessionSegmentBase, sessionStartedAt, textStatus]);

  const restartSession = useCallback(() => {
    const hasSessionData = transcriptRef.current.trim() || sessionSegmentBase + audioSegmentsRef.current.length > 0;
    if (hasSessionData && !window.confirm("Restart this transcription session? Its transcript will be kept in History; current audio and editor will be cleared.")) return;
    saveActiveSessionNow();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current);
    audioUrlRef.current = null;
    outUrlRef.current = null;
    transcriptRef.current = "";
    audioSegmentsRef.current = [];
    transcribedCountRef.current = 0;
    setTranscript("");
    setAudioSegments([]);
    setAudioName("");
    setAudioUrl(null);
    setOutUrl(null);
    setTranscribedCount(0);
    setTranscribing(false);
    setSpeaking(false);
    setRefurbishing(false);
    setSuggestion("");
    setTextStatus("Ready for your words");
    setNote("Choose a local Piper voice to hear your text.");
    const nextToken = sessionTokenRef.current + 1;
    sessionTokenRef.current = nextToken;
    setSessionToken(nextToken);
    const nextId = newId();
    const nextStartedAt = new Date().toISOString();
    setSessionId(nextId);
    setSessionStartedAt(nextStartedAt);
    setSessionSegmentBase(0);
    clearActiveSession();
    showToast("Session restarted. Your previous transcript is in History.");
  }, [saveActiveSessionNow, sessionSegmentBase, showToast]);

  const openHistorySession = useCallback((session: SessionRecord) => {
    saveActiveSessionNow();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current);
    audioUrlRef.current = null;
    outUrlRef.current = null;
    transcriptRef.current = session.transcript;
    audioSegmentsRef.current = [];
    transcribedCountRef.current = 0;
    setTranscript(session.transcript);
    setAudioSegments([]);
    setAudioName("");
    setAudioUrl(null);
    setOutUrl(null);
    setTranscribedCount(0);
    setTranscribing(false);
    setSpeaking(false);
    setRefurbishing(false);
    setSuggestion("");
    setTextStatus(session.textStatus || "Restored from History");
    setSessionId(session.id);
    setSessionStartedAt(session.startedAt);
    setSessionSegmentBase(session.segmentCount);
    const nextToken = sessionTokenRef.current + 1;
    sessionTokenRef.current = nextToken;
    setSessionToken(nextToken);
    navigate("studio");
  }, [navigate, saveActiveSessionNow]);

  const removeHistoryItem = useCallback((id: string) => {
    const next = history.filter((row) => row.id !== id);
    persistHistory(next);
    setHistory(next);
    if (id === sessionId) clearActiveSession();
    showToast("Session removed from History.");
  }, [history, sessionId, showToast]);

  const clearHistory = useCallback(() => {
    persistHistory([]);
    setHistory([]);
    clearActiveSession();
    showToast("Transcript history cleared from this browser.");
  }, [showToast]);

  const changeModel = useCallback((model: string) => setGeminiModel(model), []);
  const geminiConfigured = Boolean(geminiSettings?.configured);
  const pendingCount = Math.max(0, audioSegments.length - transcribedCount);
  const statusLabel = status?.stub
    ? "DUMMY MODE"
    : status?.stt_ready && status?.tts_ready
      ? "LOCAL MODELS"
      : checking
        ? "CONNECTING…"
        : "MODELS OFFLINE";

  return (
    <div className="app-shell min-h-screen">
      <aside className="sidebar" aria-label="Main navigation">
        <button type="button" className="brand-lockup" onClick={() => navigate("studio")} aria-label="Forma voice studio">
          <span className="brand-mark"><i /><i /><i /><i /></span><span className="brand-name">forma<span>®</span></span>
        </button>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="sidebar-nav">
          {NAV.map(({ id, label, Icon }) => <button key={id} type="button" className={`sidebar-link ${page === id ? "active" : ""}`} aria-current={page === id ? "page" : undefined} onClick={() => navigate(id)}><Icon className="h-[18px] w-[18px]" /><span>{label}</span>{id === "history" && history.length ? <small>{history.length}</small> : null}</button>)}
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-status"><span className={`status-dot ${status?.stub ? "stub" : status?.stt_ready ? "online" : ""}`} />{statusLabel}</div><div className="sidebar-local-note">Whisper + Piper run locally.<br />Gemini is opt-in.</div></div>
      </aside>

      <div className="workspace-shell">
        <header className="topbar">
          <div className="topbar-brand-mobile"><span className="brand-mark small"><i /><i /><i /><i /></span><span className="wordmark">forma<span>®</span></span></div>
          <div className="topbar-context">{NAV.find((item) => item.id === page)?.label ?? "Voice studio"}</div>
          <div className="topbar-actions">
            <Badge variant="outline" className={`model-status ${status?.stub ? "stub-status" : ""}`}><span className={`status-dot ${status?.stub ? "stub" : status?.stt_ready ? "online" : ""}`} />{statusLabel}</Badge>
            {page === "studio" ? <Button variant="outline" size="sm" onClick={restartSession} className="restart-button" title="Save to history and clear the current session"><RotateCcw className="h-3.5 w-3.5" /><span>Restart session</span></Button> : null}
            <ThemeToggle />
          </div>
        </header>

        <main className="workspace-main">
          {page === "studio" ? (
            <div className="page-stack studio-page">
              <div className="page-heading-row studio-heading"><div><div className="eyebrow"><Sparkles className="h-3.5 w-3.5" /> LOCAL VOICE WORKSPACE</div><h1 className="page-title">Voice studio<span className="text-violet">.</span></h1><p className="page-subtitle">Capture, append, refine, then give your words a voice.</p></div><span className="session-word-count">{sessionWordCount(transcript)} words · {sessionSegmentBase + audioSegments.length} audio {sessionSegmentBase + audioSegments.length === 1 ? "part" : "parts"}</span></div>
              {sessionSegmentBase > 0 && !audioSegments.length ? <div className="notice-card"><Clock3 className="h-4 w-4 text-violet" /><p>This transcript was restored from History. Original audio is not stored there; new recordings will append to the transcript.</p></div> : null}
              <div className="studio-grid">
                <CaptureCard key={sessionToken} sessionToken={sessionToken} onCapture={handleCapture} onTranscribe={(language) => void handleTranscribe(language)} transcribing={transcribing} hasAudio={audioSegments.length > 0} audioName={audioName} audioUrl={audioUrl} segmentCount={sessionSegmentBase + audioSegments.length} pendingCount={pendingCount} />
                <TranscriptCard value={transcript} onChange={handleTranscriptChange} status={textStatus} onToast={showToast} geminiConfigured={geminiConfigured} refurbishing={refurbishing} suggestion={suggestion} onRefurbish={() => void handleRefurbish()} onApplySuggestion={() => { if (suggestion) { handleTranscriptChange(suggestion); setSuggestion(""); setTextStatus("Refurbished with Gemini · review complete"); showToast("Gemini version applied to the transcript."); } }} onDiscardSuggestion={() => setSuggestion("")} onExport={(format: ExportFormat, text?: string) => { exportTranscript(text ?? transcript, format, text ? "Gemini refurbishment" : "Forma transcript", text ? "Gemini suggestion · review before use" : textStatus); showToast(format === "pdf" ? "Print dialog opened; choose Save as PDF." : "Transcript exported."); }} onGoToSettings={() => navigate("settings")} />
              </div>
              <SpeechPanel text={transcript} onSpeak={(voice, pace) => void handleSpeak(voice, pace)} speaking={speaking} note={note} audioUrl={outUrl} />
            </div>
          ) : null}

          {page === "search" ? <VoiceSearchPage geminiConfigured={geminiConfigured} googleSearchConfigured={Boolean(agentSearchSettings?.configured)} model={geminiModel} onGoToSettings={() => navigate("settings")} onToast={showToast} /> : null}

          {page === "history" ? <HistoryPage sessions={history} onOpen={openHistorySession} onDelete={removeHistoryItem} onClear={clearHistory} onExport={(rows, format) => { exportSessions(rows, format); showToast(format === "pdf" ? "Print dialog opened; choose Save as PDF." : "History exported."); }} /> : null}

          {page === "settings" ? <SettingsPage model={geminiModel} onModelChange={changeModel} gemini={geminiSettings} onGeminiRefresh={onGeminiRefresh} agentSearch={agentSearchSettings} onAgentSearchRefresh={onAgentSearchRefresh} onToast={showToast} onTerms={() => navigate("terms")} /> : null}

          {page === "terms" ? <TermsPage onBackToSettings={() => navigate("settings")} /> : null}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {NAV.filter((item) => item.id !== "terms").map(({ id, Icon }) => <button key={id} type="button" className={`mobile-nav-link ${page === id ? "active" : ""}`} aria-current={page === id ? "page" : undefined} onClick={() => navigate(id)}><Icon className="h-[18px] w-[18px]" /><span>{id === "studio" ? "Studio" : id === "search" ? "Search" : id === "history" ? "History" : "Settings"}</span></button>)}
      </nav>

      <div className={`toast ${toast ? "visible" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}

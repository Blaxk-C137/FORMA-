import {
  ArrowRight,
  Check,
  FileAudio,
  Globe,
  Loader2,
  Mic,
  Shield,
  Sparkles,
  Square,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioWave } from "@/components/AudioWave";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fileToWavBlob, pcmChunksToWavBlob } from "@/lib/wav";

const MAX_SECONDS = 120;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

type CaptureMode = "record" | "upload";

export type CaptureCardProps = {
  /** Called once per saved segment; appends it to this session's queue. */
  onCapture: (blob: Blob, name: string, apiBlob: Blob, sessionToken: number) => void;
  onTranscribe: (language: string) => void;
  transcribing: boolean;
  hasAudio: boolean;
  audioName: string;
  audioUrl: string | null;
  segmentCount: number;
  pendingCount: number;
  sessionToken: number;
};

function formatTimer(elapsedMs: number): string {
  const total = Math.max(0, elapsedMs);
  const min = Math.floor(total / 60000).toString().padStart(2, "0");
  const sec = Math.floor((total % 60000) / 1000).toString().padStart(2, "0");
  const cs = Math.floor((total % 1000) / 10).toString().padStart(2, "0");
  return `${min}:${sec}.${cs}`;
}

export function CaptureCard({
  onCapture,
  onTranscribe,
  transcribing,
  hasAudio,
  audioName,
  audioUrl,
  segmentCount,
  pendingCount,
  sessionToken,
}: CaptureCardProps) {
  const [mode, setMode] = useState<CaptureMode>("record");
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [hint, setHint] = useState("Your next idea starts with a single word.");
  const [liveLabel, setLiveLabel] = useState("READY WHEN YOU ARE");
  const [dragging, setDragging] = useState(false);
  const [language, setLanguage] = useState("auto");
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [playerEl, setPlayerEl] = useState<HTMLAudioElement | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const tickRef = useRef(0);
  const startRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordingRef = useRef(false);
  const mountedRef = useRef(false);
  const sessionTokenRef = useRef(sessionToken);
  const onCaptureRef = useRef(onCapture);
  const stopReasonRef = useRef<"manual" | "limit">("manual");
  sessionTokenRef.current = sessionToken;
  onCaptureRef.current = onCapture;

  const stopRecording = useCallback((reason: "manual" | "limit" = "manual") => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    stopReasonRef.current = reason;
    setRecording(false);
    setFinalizing(true);
    clearInterval(tickRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    if (reason === "limit") {
      setHint("Two-minute segment limit reached. This part is being saved; add another segment to continue.");
      setLiveLabel("SEGMENT LIMIT · SAVING");
    } else {
      setHint("Segment captured. Transcribe it or add another segment.");
      setLiveLabel("SEGMENT CAPTURED");
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recordingRef.current = false;
      clearInterval(tickRef.current);
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      void captureCtxRef.current?.close().catch(() => undefined);
      captureCtxRef.current = null;
    };
  }, []);

  useEffect(() => {
    setMode("record");
    setRecording(false);
    setRequesting(false);
    setFinalizing(false);
    setElapsed(0);
    setHint("Your next idea starts with a single word.");
    setLiveLabel("READY WHEN YOU ARE");
    setLiveStream(null);
    chunksRef.current = [];
    pcmChunksRef.current = [];
  }, [sessionToken]);

  const startRecording = useCallback(async () => {
    if (recordingRef.current || requesting || finalizing) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setHint("Recording needs a supported browser on HTTPS or localhost. You can still upload audio.");
      return;
    }
    const captureToken = sessionToken;
    setRequesting(true);
    setHint("Waiting for microphone permission…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || captureToken !== sessionTokenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      pcmChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const playbackBlob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const currentChunks = pcmChunksRef.current;
        const rate = captureCtxRef.current?.sampleRate ?? 48000;
        let apiBlob: Blob | null = currentChunks.length ? pcmChunksToWavBlob(currentChunks, rate) : null;
        if (!apiBlob && playbackBlob.size > 0) {
          try {
            apiBlob = await fileToWavBlob(playbackBlob);
          } catch {
            apiBlob = null;
          }
        }
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (mountedRef.current) setLiveStream(null);
        void captureCtxRef.current?.close().catch(() => undefined);
        captureCtxRef.current = null;
        pcmChunksRef.current = [];
        if (mountedRef.current && captureToken === sessionTokenRef.current) {
          if (playbackBlob.size > 0 && apiBlob) {
            onCaptureRef.current(playbackBlob, `Microphone segment ${segmentCount + 1}`, apiBlob, captureToken);
            setHint(stopReasonRef.current === "limit"
              ? "Segment saved. Add another segment to continue, or transcribe the new audio."
              : "Segment saved. Transcribe it or add another segment.");
          } else {
            setHint("The recording could not be prepared. Try again or upload an audio file.");
          }
          setFinalizing(false);
          setLiveLabel("SEGMENT CAPTURED");
        }
      };

      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        captureCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (event) => {
          pcmChunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
        };
        source.connect(processor);
        processor.connect(ctx.destination);
      } catch {
        pcmChunksRef.current = [];
      }

      recorder.start(200);
      recordingRef.current = true;
      setLiveStream(stream);
      setElapsed(0);
      setRecording(true);
      setFinalizing(false);
      setLiveLabel(`LISTENING · PART ${segmentCount + 1}`);
      setHint("A segment ends at two minutes; add another to continue.");
      startRef.current = performance.now();
      tickRef.current = window.setInterval(() => {
        const next = performance.now() - startRef.current;
        setElapsed(next);
        if (next >= MAX_SECONDS * 1000) stopRecording("limit");
      }, 50);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setLiveStream(null);
      const name = (error as DOMException)?.name;
      setHint(name === "NotAllowedError"
        ? "Microphone permission denied. Allow it in your browser or upload audio."
        : name === "NotFoundError"
          ? "No microphone found. Connect one or upload audio."
          : "Could not open your microphone. Check your browser settings.");
    } finally {
      if (mountedRef.current) setRequesting(false);
    }
  }, [finalizing, onCaptureRef, requesting, segmentCount, sessionToken, stopRecording]);

  const acceptFile = useCallback(async (file: File | undefined | null) => {
    if (!file || recordingRef.current) return;
    if (file.size > MAX_FILE_BYTES) return setHint("This file is over 25 MB. Choose a smaller audio file.");
    if (file.size === 0) return setHint("This file is empty.");
    const looksAudio = file.type.startsWith("audio/") || /\.(wav|mp3|m4a|ogg|webm|flac|aac)$/i.test(file.name);
    if (!looksAudio) return setHint("Please choose a supported audio file.");
    setHint("Preparing audio locally…");
    setFinalizing(true);
    const captureToken = sessionToken;
    try {
      const apiBlob = await fileToWavBlob(file);
      if (!mountedRef.current || captureToken !== sessionTokenRef.current) return;
      onCaptureRef.current(file, file.name, apiBlob, captureToken);
      setHint("Audio added to this session. Transcribe it or add another segment.");
      setLiveLabel("AUDIO READY");
    } catch {
      setHint("Could not decode this file in the browser. Try WAV, MP3, M4A, OGG, or WebM.");
    } finally {
      if (mountedRef.current) setFinalizing(false);
    }
  }, [sessionToken]);

  return (
    <section className={`panel capture-card ${recording ? "recording-live" : ""}`} id="capture" aria-label="Audio capture">
      <div className="panel-head">
        <span className="step-chip"><span className="step">01</span> Capture audio</span>
        <Badge variant="outline">{recording ? "RECORDING" : transcribing ? "TRANSCRIBING" : hasAudio ? `${segmentCount} ${segmentCount === 1 ? "PART" : "PARTS"}` : "READY"}</Badge>
      </div>

      <Tabs value={mode} onValueChange={(value) => !recordingRef.current && !finalizing && setMode(value as CaptureMode)} className="capture-tabs">
        <TabsList className="capture-tabs-list">
          <TabsTrigger value="record" disabled={recording || requesting || finalizing} className="gap-2">
            <Mic className="h-3.5 w-3.5" /> Record
          </TabsTrigger>
          <TabsTrigger value="upload" disabled={recording || requesting || finalizing} className="gap-2">
            <Upload className="h-3.5 w-3.5" /> Upload
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "record" ? (
        <div className="capture-stage compact-stage">
          <div className="glow" />
          <span className="relative z-[1] text-[10px] tracking-[0.2em] text-muted-foreground">{liveLabel}</span>
          <AudioWave stream={liveStream} audioEl={recording ? null : playerEl} height={72} className="relative z-[1]" />
          <div className={`timer ${recording ? "live" : ""}`}>{formatTimer(elapsed)}</div>
          <div className="relative z-[1] text-center text-[11px] text-muted-foreground">{hint}</div>
        </div>
      ) : (
        <div
          className={`dropzone compact-dropzone ${dragging ? "dragging" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); void acceptFile(event.dataTransfer.files?.[0]); }}
        >
          <FileAudio className="h-7 w-7 text-violet" />
          <strong className="text-sm font-medium">{hasAudio ? audioName : "Drop an audio file here"}</strong>
          <span className="text-[11px] text-muted-foreground">{hint}</span>
          <Button variant="outline" size="sm" className="mt-1 gap-2" onClick={(event) => { event.stopPropagation(); fileInputRef.current?.click(); }}>
            Browse files <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.webm,.m4a,.ogg,.wav,.mp3"
            className="hidden"
            onChange={(event) => { void acceptFile(event.target.files?.[0]); event.target.value = ""; }}
          />
        </div>
      )}

      <div className="capture-actions">
        {mode === "record" ? (
          <Button
            onClick={() => recording ? stopRecording("manual") : void startRecording()}
            disabled={requesting || finalizing}
            className={`w-full gap-2 ${recording ? "bg-pink text-primary-foreground hover:bg-pink/90" : ""}`}
          >
            {requesting || finalizing
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : recording
                ? <Square className="h-3.5 w-3.5 fill-current" />
                : hasAudio
                  ? <Mic className="h-4 w-4" />
                  : <Mic className="h-4 w-4" />}
            {requesting ? "Waiting for microphone…" : finalizing ? "Saving segment…" : recording ? "Stop this segment" : hasAudio ? `Add more audio · part ${segmentCount + 1}` : "Start recording"}
          </Button>
        ) : (
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={requesting || finalizing} className="w-full gap-2">
            <Upload className="h-4 w-4" /> {finalizing ? "Preparing audio…" : "Choose another audio file"}
          </Button>
        )}

        <Button onClick={() => onTranscribe(language)} disabled={!pendingCount || transcribing || recording || finalizing} className="w-full gap-2">
          {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : pendingCount ? <Sparkles className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {transcribing
            ? "Transcribing new audio…"
            : pendingCount
              ? `Transcribe ${pendingCount} new ${pendingCount === 1 ? "part" : "parts"}`
              : hasAudio
                ? "All parts transcribed"
                : "Transcribe audio"}
        </Button>

        {audioUrl ? <audio ref={setPlayerEl} controls src={audioUrl} className="w-full" aria-label="Latest audio segment" /> : null}

        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <label className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5" /> Language
            <select aria-label="Transcription language" value={language} onChange={(event) => setLanguage(event.target.value)} className="select-control select-small">
              <option value="auto">Auto-detect</option>
              <option value="en">English</option><option value="fr">French</option><option value="es">Spanish</option>
              <option value="pt">Portuguese</option><option value="ar">Arabic</option><option value="de">German</option>
              <option value="zh">Chinese</option><option value="hi">Hindi</option><option value="yo">Yoruba</option><option value="ha">Hausa</option>
            </select>
          </label>
          <span>{segmentCount ? `${segmentCount} saved · ${pendingCount} new` : "Two-minute segments · add more anytime"}</span>
        </div>
      </div>

      <div className="privacy-note"><Shield className="h-3.5 w-3.5 text-violet" /> Audio is transcribed locally with Whisper. No audio is sent to Gemini.</div>
    </section>
  );
}

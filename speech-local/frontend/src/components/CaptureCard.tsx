import {
  ArrowRight,
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
  /** (playbackBlob, name, apiWavBlob) — apiWavBlob is 16 kHz mono WAV for the STT API */
  onCapture: (blob: Blob, name: string, apiBlob?: Blob) => void;
  onTranscribe: () => void;
  transcribing: boolean;
  hasAudio: boolean;
  audioName: string;
  audioUrl: string | null;
  onSampleFill: () => void;
};

function formatTimer(elapsedMs: number): string {
  const total = Math.max(0, elapsedMs);
  const min = Math.floor(total / 60000)
    .toString()
    .padStart(2, "0");
  const sec = Math.floor((total % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  const cs = Math.floor((total % 1000) / 10)
    .toString()
    .padStart(2, "0");
  return `${min}:${sec}.${cs}`;
}

export function CaptureCard({
  onCapture,
  onTranscribe,
  transcribing,
  hasAudio,
  audioName,
  audioUrl,
  onSampleFill,
}: CaptureCardProps) {
  const [mode, setMode] = useState<CaptureMode>("record");
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [hint, setHint] = useState("Your next idea starts with a single word.");
  const [liveLabel, setLiveLabel] = useState("LET'S MAKE SOME WAVES");
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

  const stopRecording = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    clearInterval(tickRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setLiveLabel("A THOUGHT, CAPTURED");
    setHint("Listen back, then make it yours.");
  }, []);

  // safety: release the mic if the card unmounts mid-recording
  useEffect(
    () => () => {
      recordingRef.current = false;
      clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    },
    [],
  );

  const startRecording = useCallback(async () => {
    if (recordingRef.current || requesting) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setHint("Recording needs a supported browser on HTTPS or localhost. You can still upload audio.");
      return;
    }
    setRequesting(true);
    setHint("Waiting for microphone permission…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setLiveStream(null);
        const rate = captureCtxRef.current?.sampleRate ?? 48000;
        const apiBlob = pcmChunksToWavBlob(pcmChunksRef.current, rate);
        pcmChunksRef.current = [];
        void captureCtxRef.current?.close().catch(() => undefined);
        captureCtxRef.current = null;
        if (blob.size > 0) onCapture(blob, "Microphone recording", apiBlob);
      };
      // raw PCM tap → 16 kHz WAV for the STT API (no ffmpeg needed anywhere)
      try {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        captureCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          pcmChunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        };
        source.connect(processor);
        processor.connect(ctx.destination);
      } catch {
        pcmChunksRef.current = [];
      }
      recorder.start(200);
      recordingRef.current = true;
      setLiveStream(stream);
      setRecording(true);
      setLiveLabel("LISTENING TO YOU");
      setHint(`Take your time. This space is yours. · ${MAX_SECONDS / 60} min limit`);
      startRef.current = performance.now();
      tickRef.current = window.setInterval(() => {
        const next = performance.now() - startRef.current;
        setElapsed(next);
        if (next >= MAX_SECONDS * 1000) stopRecording();
      }, 40);
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setLiveStream(null);
      const name = (err as DOMException)?.name;
      setHint(
        name === "NotAllowedError"
          ? "Microphone permission denied. Allow it in your browser or upload a file."
          : name === "NotFoundError"
            ? "No microphone found. Connect one or upload audio."
            : "Could not open your microphone. Check your browser settings.",
      );
    } finally {
      setRequesting(false);
    }
  }, [onCapture, requesting, stopRecording]);

  const acceptFile = useCallback(
    (file: File | undefined | null) => {
      if (!file || recordingRef.current) return;
      if (file.size > MAX_FILE_BYTES) return setHint("This file is over 25 MB. Choose a smaller audio file.");
      if (file.size === 0) return setHint("This file is empty.");
      const looksAudio = file.type.startsWith("audio/") || /\.(wav|mp3|m4a|ogg|webm|flac|aac)$/i.test(file.name);
      if (!looksAudio) return setHint("Please choose a supported audio file.");
      setHint("Preparing audio…");
      onCapture(file, file.name);
      // decode in the browser to 16 kHz WAV so the API needs no ffmpeg
      void fileToWavBlob(file)
        .then((apiBlob) => onCapture(file, file.name, apiBlob))
        .catch(() => setHint("Could not decode this audio file in the browser."));
    },
    [onCapture],
  );

  return (
    <section className={`panel ${recording ? "recording-live" : ""}`} id="capture" aria-label="Audio capture">
      <div className="panel-head">
        <span className="step-chip">
          <span className="step">01</span> Capture your voice
        </span>
        <Badge variant="outline">{recording ? "RECORDING" : hasAudio ? "AUDIO READY" : "INPUT"}</Badge>
      </div>

      <Tabs value={mode} onValueChange={(v) => !recordingRef.current && setMode(v as CaptureMode)} className="px-6 pt-5">
        <TabsList className="w-full max-w-[300px]">
          <TabsTrigger value="record" disabled={recording || requesting} className="gap-2">
            <Mic className="h-3.5 w-3.5" /> Record audio
          </TabsTrigger>
          <TabsTrigger value="upload" disabled={recording || requesting} className="gap-2">
            <Upload className="h-3.5 w-3.5" /> Upload file
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "record" ? (
        <div className="capture-stage">
          <div className="glow" />
          <span className="text-[10px] tracking-[0.22em] text-muted-foreground">{liveLabel}</span>
          <AudioWave
            stream={liveStream}
            audioEl={recording ? null : playerEl}
            height={82}
            className="relative z-[1]"
          />
          <div className={`timer ${recording ? "live" : ""}`}>{formatTimer(elapsed)}</div>
          <div className="text-[11px] text-muted-foreground">{hint}</div>
        </div>
      ) : (
        <div
          className={`dropzone ${dragging ? "dragging" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            acceptFile(e.dataTransfer.files?.[0]);
          }}
        >
          <FileAudio className="h-8 w-8 text-violet" />
          <strong className="text-sm font-medium">{hasAudio ? audioName : "Drop your audio here"}</strong>
          <span className="text-[11px] text-muted-foreground">{hint}</span>
          <Button variant="outline" size="sm" className="mt-1 gap-2" onClick={(e) => e.stopPropagation()}>
            Browse files <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.webm,.m4a,.ogg,.wav,.mp3"
            className="hidden"
            onChange={(e) => {
              acceptFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 px-6 pb-5 pt-4">
        {recording ? (
          <Button onClick={stopRecording} className="w-full gap-2 bg-pink text-primary-foreground hover:bg-pink/90">
            <Square className="h-3.5 w-3.5 fill-current" /> Stop recording
          </Button>
        ) : hasAudio ? (
          <>
            <Button onClick={onTranscribe} disabled={transcribing} className="w-full gap-2">
              {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {transcribing ? "Transcribing…" : "Transcribe audio"}
            </Button>
            {audioUrl ? (
              <audio
                ref={setPlayerEl}
                controls
                src={audioUrl}
                className="w-full"
                aria-label="Recorded or uploaded audio"
              />
            ) : null}
          </>
        ) : (
          <Button onClick={startRecording} disabled={requesting} className="w-full gap-2">
            {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            {requesting ? "Requesting microphone…" : "Start recording"}
            <kbd className="ml-auto rounded border border-border px-1.5 text-[10px] font-normal opacity-70">Space</kbd>
          </Button>
        )}

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <label className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5" />
            <span>Language</span>
            <select
              aria-label="Transcription language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="rounded-md border border-border bg-transparent px-2 py-1 text-[11px] text-foreground outline-none"
            >
              <option value="auto">Auto-detect</option>
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="es">Spanish</option>
              <option value="pt">Portuguese</option>
              <option value="ar">Arabic</option>
              <option value="de">German</option>
              <option value="zh">Chinese</option>
              <option value="hi">Hindi</option>
              <option value="yo">Yoruba</option>
              <option value="ha">Hausa</option>
            </select>
          </label>
          <button type="button" onClick={onSampleFill} className="underline decoration-dotted underline-offset-4 hover:text-foreground">
            Try sample text
          </button>
        </div>
      </div>

      <div className="privacy-note">
        <Shield className="h-3.5 w-3.5 text-violet" />
        Audio stays in this session. No cloud speech APIs.
      </div>
    </section>
  );
}

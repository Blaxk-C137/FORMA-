import { ScrollTrigger } from "gsap/ScrollTrigger";
import gsap from "gsap";
import { Cpu, Gauge, Plus, Shield, Sparkles, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Marquee } from "@/components/ui/marquee";
import { SparklesText } from "@/components/ui/sparkles-text";
import { CaptureCard } from "@/components/CaptureCard";
import { Scene } from "@/components/Scene";
import { SpeechPanel } from "@/components/SpeechPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TranscriptCard } from "@/components/TranscriptCard";
import { useSpeechApi } from "@/hooks/useSpeechApi";

gsap.registerPlugin(ScrollTrigger);

const SAMPLE_TEXT = `Some ideas arrive quietly. Others ask to be heard.

This is a space for both. A place to turn a passing thought into something you can hold, shape, and share.

So go ahead. Say the thing.`;

const MARQUEE_ITEMS = [
  "LOCAL BY DESIGN",
  "WHISPER TINY",
  "PIPER TTS",
  "NO CLOUD SPEECH API",
  "PRIVATE BY DEFAULT",
  "FINE-TUNABLE",
  "MEASURED WITH WER",
  "WORKS OFFLINE",
];

const FEATURES = [
  {
    name: "Runs on your machine",
    className: "col-span-3 md:col-span-2",
    description: "Speech never leaves your computer. The backend talks to local models, not a cloud API.",
    Icon: Shield,
    href: "#capture",
    cta: "Open the studio",
    background: "radial-gradient(120% 120% at 0% 0%, rgba(139,92,246,0.22), transparent 55%)",
  },
  {
    name: "Whisper Tiny, fine-tunable",
    className: "col-span-3 md:col-span-1",
    description: "A lightweight multilingual model you can adapt to your own speech data.",
    Icon: Cpu,
    href: "#capture",
    cta: "See pipeline",
    background: "radial-gradient(120% 120% at 100% 0%, rgba(254,139,187,0.20), transparent 55%)",
  },
  {
    name: "Measured, not guessed",
    className: "col-span-3 md:col-span-1",
    description: "Pretrained vs fine-tuned: real Word Error Rate and response times.",
    Icon: Gauge,
    href: "#transcript",
    cta: "Read the method",
    background: "radial-gradient(120% 120% at 0% 100%, rgba(214,252,140,0.16), transparent 55%)",
  },
  {
    name: "Offline after setup",
    className: "col-span-3 md:col-span-2",
    description: "Download once during setup, then record, transcribe and synthesise with no internet at all.",
    Icon: WifiOff,
    href: "#speech",
    cta: "Generate speech",
    background: "radial-gradient(120% 120% at 100% 100%, rgba(139,92,246,0.20), transparent 55%)",
  },
];

export default function App() {
  const [transcript, setTranscript] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [apiBlob, setApiBlob] = useState<Blob | null>(null);
  const [audioName, setAudioName] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [textStatus, setTextStatus] = useState("Ready for your words");
  const [note, setNote] = useState("Voice selection preview · model setup required");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<{ title: string; body: string } | null>(null);

  const toastTimer = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const { status, checking, transcribe, synthesize } = useSpeechApi();

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 4200);
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(".intro-line", { y: 16, opacity: 0, duration: 0.5 })
        .from("#capture", { y: 22, opacity: 0, duration: 0.55 }, "-=0.28")
        .from("#transcript", { y: 22, opacity: 0, duration: 0.55 }, "-=0.42")
        .from("#speech", { y: 22, opacity: 0, duration: 0.55 }, "-=0.38");
      gsap.utils.toArray<HTMLElement>(".reveal").forEach((el) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: "top 92%", once: true },
          y: 26,
          opacity: 0,
          duration: 0.7,
          ease: "power3.out",
          clearProps: "transform,opacity",
        });
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const handleCapture = useCallback(
    (blob: Blob, name: string, apiBlob?: Blob) => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioBlob(blob);
      setApiBlob(apiBlob ?? null);
      setAudioName(name);
      setAudioUrl(URL.createObjectURL(blob));
    },
    [audioUrl],
  );

  const handleTranscribe = useCallback(async () => {
    if (!audioBlob) return;
    if (!status?.stt_ready) {
      setModal({
        title: "The stage is set. Models come next.",
        body: "Your audio is captured and ready, but no speech backend is connected. Start the app with npm run dev — it starts the local ML backend automatically — and try again. There are no simulated AI results or cloud speech fallbacks.",
      });
      return;
    }
    setTranscribing(true);
    const result = await transcribe(apiBlob ?? audioBlob, audioName || "recording.webm", "auto");
    setTranscribing(false);
    if (result.ok) {
      setTranscript(result.data.text);
      setTextStatus(status.stub ? "Stub transcription · dummy backend" : "Transcribed locally");
      showToast(status.stub ? "Transcribed by the dummy backend (stub text)." : "Your transcript is ready.");
    } else {
      showToast(result.error);
    }
  }, [audioBlob, audioName, showToast, status, transcribe]);

  const handleSpeak = useCallback(
    async (voice: string, pace: number) => {
      if (!transcript.trim()) return;
      if (!status?.tts_ready) {
        setModal({
          title: "Your voice engine is next.",
          body: "Your text and voice selection are ready, but no speech backend is connected. Start the app with npm run dev — it includes a dummy backend — and try again. There are no simulated AI results or cloud speech fallbacks.",
        });
        return;
      }
      setSpeaking(true);
      setNote("Generating speech locally…");
      const result = await synthesize(transcript, voice, pace);
      setSpeaking(false);
      if (result.ok) {
        if (outUrl) URL.revokeObjectURL(outUrl);
        const url = URL.createObjectURL(result.data.audio);
        setOutUrl(url);
        setNote(
          status.stub
            ? "Dummy tone generated (stub) · press play, then swap in Piper for real speech."
            : "Your audio is ready. Press play.",
        );
      } else {
        showToast(result.error);
        setNote("Generation failed. Try again.");
      }
    },
    [outUrl, showToast, status, synthesize, transcript],
  );

  const statusLabel = status?.stub
    ? "DUMMY MODE"
    : status?.stt_ready && status?.tts_ready
      ? "LOCAL MODELS"
      : checking
        ? "CONNECTING…"
        : "MODELS OFFLINE";

  return (
    <div ref={rootRef} className="app-shell min-h-screen">
      <aside className="rail" aria-label="Main navigation">
        <a href="#top" className="brand-mark" aria-label="Forma home">
          <i /> <i /> <i /> <i />
        </a>
        <nav className="mt-10 flex flex-col gap-2">
          <Button variant="ghost" size="icon" asChild aria-label="Voice studio">
            <a href="#capture">
              <Sparkles />
            </a>
          </Button>
          <Button variant="ghost" size="icon" asChild aria-label="Speech">
            <a href="#speech">
              <Cpu />
            </a>
          </Button>
        </nav>
        <div className="mt-auto">
          <ThemeToggle />
        </div>
      </aside>

      <div className="pl-[76px]">
        <header className="topbar" id="top">
          <div className="flex items-center gap-5">
            <a href="#top" className="wordmark no-underline text-foreground">
              forma<span>®</span>
            </a>
            <span className="hidden border-l border-border pl-5 text-xs text-muted-foreground md:block">
              Your personal voice studio
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant={status?.stub ? "default" : "outline"}
              className={status?.stub ? "bg-lime text-primary-foreground" : ""}
            >
              {statusLabel}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                if ((audioBlob || transcript) && !window.confirm("Start a fresh session? Current audio and text will be cleared.")) return;
                setAudioBlob(null);
                setApiBlob(null);
                setAudioName("");
                setAudioUrl((prev) => {
                  if (prev) URL.revokeObjectURL(prev);
                  return null;
                });
                setTranscript("");
                setTextStatus("Ready for your words");
                showToast("Fresh canvas. Fresh possibilities.");
              }}
            >
              <Plus className="h-3.5 w-3.5" /> New session
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto max-w-[1480px] px-11 pb-16 pt-7">
          {/* Studio first — no scrolling to the mic and voice */}
          <section className="intro-line flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 pb-5">
            <h1 className="text-[clamp(27px,3vw,40px)] font-medium tracking-tight leading-none">
              Your voice, <SparklesText>reimagined.</SparklesText>
            </h1>
            <p className="text-xs text-muted-foreground">
              Speak your mind. Shape your words. Make them heard.
              {!status?.stub && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="underline decoration-dotted underline-offset-4 hover:text-foreground"
                    onClick={() => {
                      setTranscript(SAMPLE_TEXT);
                      setTextStatus("Sample text · not a transcription");
                      showToast("Sample loaded — not generated by a speech model.");
                    }}
                  >
                    Try sample text ↗
                  </button>
                </>
              )}
            </p>
          </section>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <CaptureCard
              onCapture={handleCapture}
              onTranscribe={handleTranscribe}
              transcribing={transcribing}
              hasAudio={Boolean(audioBlob)}
              audioName={audioName}
              audioUrl={audioUrl}
              onSampleFill={() => {
                setTranscript(SAMPLE_TEXT);
                setTextStatus("Sample text · not a transcription");
                showToast("Sample loaded — not generated by a speech model.");
              }}
            />
            <TranscriptCard value={transcript} onChange={setTranscript} status={textStatus} onToast={showToast} />
          </div>

          <SpeechPanel text={transcript} onSpeak={handleSpeak} speaking={speaking} note={note} audioUrl={outUrl} />

          {/* Identity visuals, below the fold */}
          <div className="reveal arc-band mt-10">
            <Scene />
          </div>

          <div className="reveal marquee-mask mt-8 overflow-hidden rounded-2xl border border-border bg-card">
            <Marquee pauseOnHover className="py-3.5 [--duration:32s]">
              {MARQUEE_ITEMS.map((item) => (
                <span key={item} className="flex items-center gap-4 px-5 text-[11px] tracking-[0.18em] text-muted-foreground">
                  <span className="h-1 w-1 rounded-full bg-violet" />
                  {item}
                </span>
              ))}
            </Marquee>
          </div>

          <section className="reveal mt-12">
            <div className="eyebrow">
              <span className="h-1.5 w-1.5 rounded-full bg-pink" /> Built for your flow
            </div>
            <h2 className="mt-3 text-2xl font-medium tracking-tight">
              Less friction. More expression<span className="text-violet">.</span>
            </h2>
            <BentoGrid className="mt-5">
              {FEATURES.map((f) => (
                <BentoCard
                  key={f.name}
                  name={f.name}
                  className={f.className}
                  description={f.description}
                  Icon={f.Icon}
                  href={f.href}
                  cta={f.cta}
                  background={<div className="absolute inset-0" style={{ background: f.background }} />}
                />
              ))}
            </BentoGrid>
          </section>
        </main>

        <footer className="flex items-center justify-between border-t border-border px-11 py-6 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="text-violet">
              <Sparkles className="h-4 w-4" />
            </span>
            <b className="font-medium text-foreground">Less friction. More expression.</b>
            <span className="hidden sm:inline">Built for your flow.</span>
          </div>
          <div>WHISPER TINY + PIPER · LOCAL BY DESIGN</div>
        </footer>
      </div>

      <div className={`toast ${toast ? "visible" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>

      {modal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-card">
            <h2 id="modal-title" className="text-xl font-medium tracking-tight">
              {modal.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{modal.body}</p>
            <Button className="mt-6 w-full" onClick={() => setModal(null)}>
              Got it
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

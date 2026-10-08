import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { AudioWave } from "@/components/AudioWave";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export type SpeechPanelProps = {
  text: string;
  onSpeak: (voice: string, pace: number) => void;
  speaking: boolean;
  note: string;
  audioUrl: string | null;
};

const VOICES = [
  { id: "lessac", name: "Lessac", sub: "English · US", pearl: false },
  { id: "alba", name: "Alba", sub: "English · UK", pearl: true },
] as const;

export function SpeechPanel({ text, onSpeak, speaking, note, audioUrl }: SpeechPanelProps) {
  const [voice, setVoice] = useState<string>("lessac");
  const [pace, setPace] = useState<number[]>([1]);
  const [playerEl, setPlayerEl] = useState<HTMLAudioElement | null>(null);

  return (
    <section className="panel mt-5" id="speech" aria-label="Speech synthesis">
      <div className="panel-head">
        <span className="step-chip">
          <span className="step">03</span> Give your words a voice
        </span>
        <Badge variant="outline">PIPER TTS</Badge>
      </div>

      <div className="grid items-center gap-8 px-6 pb-6 pt-6 lg:grid-cols-[1fr_1.5fr_1fr]">
        <div>
          <h2 className="text-2xl font-medium tracking-tight">
            From thought to sound<span className="text-violet">.</span>
          </h2>
          <p className="mt-2 max-w-[260px] text-[12px] leading-relaxed text-muted-foreground">
            A voice that feels right. Pick your tone and bring your words to life.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {VOICES.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`voice-card ${voice === v.id ? "selected" : ""}`}
                aria-pressed={voice === v.id}
                onClick={() => setVoice(v.id)}
              >
                <span className={`voice-orb ${v.pearl ? "pearl" : ""}`} />
                <span>
                  <strong className="block text-[12px] font-medium">{v.name}</strong>
                  <small className="text-[10px] text-muted-foreground">{v.sub}</small>
                </span>
                <span
                  className={`absolute right-2.5 top-2.5 h-3 w-3 rounded-full border ${
                    voice === v.id ? "border-violet bg-violet" : "border-border"
                  }`}
                />
              </button>
            ))}
          </div>

          <label className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="whitespace-nowrap">Pace</span>
            <Slider
              value={pace}
              min={0.5}
              max={1.5}
              step={0.05}
              onValueChange={setPace}
              aria-label="Speech pace"
            />
            <span className="w-10 text-right tabular-nums text-foreground">{pace[0].toFixed(2)}×</span>
          </label>
        </div>

        <div>
          <Button
            className="w-full gap-2"
            disabled={!text.trim() || speaking}
            onClick={() => onSpeak(voice, pace[0])}
          >
            {speaking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {speaking ? "Generating speech…" : "Generate speech"}
          </Button>
          <p className="mt-2.5 text-center text-[10px] leading-relaxed text-muted-foreground">{note}</p>
          {audioUrl ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-border bg-muted/40">
              <AudioWave audioEl={playerEl} height={62} />
              <audio
                ref={setPlayerEl}
                controls
                src={audioUrl}
                className="w-full border-t border-border"
                aria-label="Generated speech"
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

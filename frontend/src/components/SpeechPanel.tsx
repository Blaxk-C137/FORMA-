import { Download, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { AudioWave } from "@/components/AudioWave";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { HOSTED_SPEECH_MODE } from "@/lib/deployment";

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
    <section className="panel speech-panel" id="speech" aria-label="Speech synthesis">
      <div className="panel-head">
        <span className="step-chip"><span className="step">03</span> Voice output</span>
        <Badge variant="outline">{HOSTED_SPEECH_MODE ? "PIPER · HOSTED" : "PIPER · LOCAL"}</Badge>
      </div>
      <div className="speech-content">
        <div className="voice-options">
          {VOICES.map((item) => (
            <button key={item.id} type="button" className={`voice-card ${voice === item.id ? "selected" : ""}`} aria-pressed={voice === item.id} onClick={() => setVoice(item.id)}>
              <span className={`voice-orb ${item.pearl ? "pearl" : ""}`} />
              <span><strong className="block text-[12px] font-medium">{item.name}</strong><small className="text-[10px] text-muted-foreground">{item.sub}</small></span>
            </button>
          ))}
        </div>
        <label className="pace-control"><span>Pace</span><Slider value={pace} min={0.5} max={1.5} step={0.05} onValueChange={setPace} aria-label="Speech pace" /><span className="w-10 text-right tabular-nums text-foreground">{pace[0].toFixed(2)}×</span></label>
        <div className="speech-actions">
          <Button className="w-full gap-2" disabled={!text.trim() || speaking} onClick={() => onSpeak(voice, pace[0])}>
            {speaking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {speaking ? "Generating…" : "Generate speech"}
          </Button>
          <p className="text-center text-[10px] leading-relaxed text-muted-foreground">{note}</p>
        </div>
        {audioUrl ? (
          <div className="speech-player">
            <AudioWave audioEl={playerEl} height={54} />
            <audio ref={setPlayerEl} controls src={audioUrl} className="w-full border-t border-border" aria-label="Generated speech" />
            <a className="download-audio" href={audioUrl} download="forma-voice.wav"><Download className="h-3.5 w-3.5" /> Download audio (.wav)</a>
          </div>
        ) : null}
      </div>
    </section>
  );
}

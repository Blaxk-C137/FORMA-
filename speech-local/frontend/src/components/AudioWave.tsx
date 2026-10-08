import { useEffect, useRef } from "react";

export type AudioWaveProps = {
  /** Live microphone stream — the wave reacts to it in real time. */
  stream?: MediaStream | null;
  /** Media element to analyse during playback (recorded or generated audio). */
  audioEl?: HTMLAudioElement | null;
  height?: number;
  className?: string;
};

/* ── shared audio graph (survives StrictMode remounts; MediaElementSource
      may only ever be created once per element) ── */
let sharedCtx: AudioContext | null = null;
const elAnalysers = new WeakMap<HTMLAudioElement, AnalyserNode>();
const elSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

function getCtx(): AudioContext {
  if (!sharedCtx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new Ctor();
  }
  return sharedCtx;
}

function elementAnalyser(el: HTMLAudioElement): AnalyserNode {
  const existing = elAnalysers.get(el);
  if (existing) return existing;
  const ctx = getCtx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.55;
  let src = elSources.get(el);
  if (!src) {
    src = ctx.createMediaElementSource(el);
    elSources.set(el, src);
  }
  src.connect(analyser);
  analyser.connect(ctx.destination); // re-route: element audio must reach the speakers
  elAnalysers.set(el, analyser);
  return analyser;
}

const BARS_MAX = 96;
const BARS_MIN = 28;

export function AudioWave({ stream = null, audioEl = null, height = 96, className = "" }: AudioWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const envRef = useRef(new Float32Array(BARS_MAX));
  const peakRef = useRef(new Float32Array(BARS_MAX));
  const flashRef = useRef(0);
  const flashXRef = useRef(0.5);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = getCtx();
    void ctx.resume().catch(() => undefined);

    let analyser: AnalyserNode | null = null;
    let streamSource: MediaStreamAudioSourceNode | null = null;
    let freq = new Uint8Array(512);
    let wave = new Uint8Array(1024);

    if (stream) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
      streamSource = ctx.createMediaStreamSource(stream);
      streamSource.connect(analyser);
      freq = new Uint8Array(analyser.frequencyBinCount);
      wave = new Uint8Array(analyser.fftSize);
    } else if (audioEl) {
      analyser = elementAnalyser(audioEl);
      freq = new Uint8Array(analyser.frequencyBinCount);
      wave = new Uint8Array(analyser.fftSize);
    }

    const onResume = () => void ctx.resume().catch(() => undefined);
    audioEl?.addEventListener("play", onResume);

    let cssW = 1;
    let cssH = height;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      cssW = Math.max(1, rect.width);
      cssH = Math.max(1, rect.height);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const env = envRef.current;
    const peaks = peakRef.current;
    let frame = 0;
    let visible = true;
    let slowFrames = 0;
    let lastRms = 0;

    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (reduced && slowFrames++ % 5 !== 0) return;
      if (!visible) return;

      const t = performance.now() / 1000;
      const cy = cssH / 2;
      const bars = Math.round(Math.min(BARS_MAX, Math.max(BARS_MIN, cssW / 9)));
      const slot = cssW / bars;
      const barW = Math.max(2, slot * 0.56);
      const half = cssH * 0.38;

      let rms = 0;
      let live = false;
      if (analyser && stream) {
        live = true;
      } else if (analyser && audioEl) {
        live = !audioEl.paused && !audioEl.ended;
      }
      if (analyser && live) {
        analyser.getByteFrequencyData(freq);
        analyser.getByteTimeDomainData(wave);
        let sum = 0;
        for (let i = 0; i < wave.length; i += 2) {
          const v = (wave[i] - 128) / 128;
          sum += v * v;
        }
        rms = Math.sqrt(sum / (wave.length / 2));
      }

      const binHz = ctx.sampleRate / 2 / freq.length;
      let bestI = 0;
      let bestV = 0;

      for (let i = 0; i < bars; i++) {
        let target: number;
        if (analyser && live) {
          // speech-weighted log bands: 80 Hz → 8 kHz
          const f0 = 80 * Math.pow(100, i / (bars - 1));
          const f1 = 80 * Math.pow(100, (i + 1) / (bars - 1));
          const b0 = Math.min(freq.length - 1, Math.floor(f0 / binHz));
          const b1 = Math.min(freq.length, Math.max(b0 + 1, Math.ceil(f1 / binHz)));
          let acc = 0;
          for (let b = b0; b < b1; b++) acc += freq[b];
          const val = acc / (b1 - b0) / 255;
          target = Math.pow(val, 1.25) * (0.72 + 0.55 * Math.sin((i / (bars - 1)) * Math.PI));
        } else {
          // ambient: a resting voice, breathing
          const shape = Math.pow(Math.sin((i / (bars - 1)) * Math.PI), 1.15);
          const motion =
            0.5 +
            0.32 * Math.sin(i * 0.31 + t * 1.9) +
            0.22 * Math.sin(i * 0.11 - t * 1.2) +
            0.16 * Math.sin(i * 0.63 + t * 0.8);
          target = (reduced ? 0.28 : 0.1 + 0.42 * Math.max(0, motion)) * shape;
        }
        // fast attack, slow release — snaps on syllables
        const e = env[i];
        env[i] = target > e ? e + (target - e) * 0.62 : e + (target - e) * 0.14;

        if (env[i] > bestV) {
          bestV = env[i];
          bestI = i;
        }

        // peak-hold caps with gravity
        peaks[i] = Math.max(env[i], peaks[i] - 0.012 - peaks[i] * 0.028);
      }

      g.clearRect(0, 0, cssW, cssH);

      // transient bloom on loud bursts
      const burst = rms > 0.16 && rms > lastRms * 1.22;
      if (burst && !reduced) {
        flashRef.current = 1;
        flashXRef.current = bestI / Math.max(1, bars - 1);
      }
      flashRef.current *= 0.9;
      lastRms = lastRms + (rms - lastRms) * 0.4;
      if (flashRef.current > 0.02) {
        g.globalCompositeOperation = "lighter";
        const fl = flashRef.current;
        const grad = g.createRadialGradient(cssW * flashXRef.current, cy, 0, cssW * flashXRef.current, cy, cssW * 0.32);
        grad.addColorStop(0, `rgba(167, 139, 250, ${0.22 * fl})`);
        grad.addColorStop(1, "rgba(167, 139, 250, 0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, cssW, cssH);
        g.globalCompositeOperation = "source-over";
      }

      // luminous centre line — pulses with voice level
      const lineA = 0.16 + Math.min(0.75, rms * 2.6 + env[bestI] * 0.16);
      const line = g.createLinearGradient(0, 0, cssW, 0);
      line.addColorStop(0, "rgba(167, 139, 250, 0)");
      line.addColorStop(0.5, `rgba(196, 167, 255, ${lineA})`);
      line.addColorStop(1, "rgba(167, 139, 250, 0)");
      g.strokeStyle = line;
      g.lineWidth = 1.5 + rms * 2;
      g.shadowColor = "rgba(139, 92, 246, 0.85)";
      g.shadowBlur = reduced ? 0 : 12 + rms * 34;
      g.beginPath();
      g.moveTo(0, cy);
      g.lineTo(cssW, cy);
      g.stroke();
      g.shadowBlur = 0;

      // mirrored bars with gradient + glow
      for (let i = 0; i < bars; i++) {
        const x = i * slot + (slot - barW) / 2;
        const h = Math.max(1.5, half * env[i]);
        const p = Math.max(2.2, half * peaks[i]);
        const glow = env[i];

        const fill = g.createLinearGradient(0, cy - h, 0, cy + h);
        const alpha = 0.34 + 0.66 * Math.min(1, glow * 1.25);
        fill.addColorStop(0, `rgba(254, 139, 187, ${alpha * 0.85})`);
        fill.addColorStop(0.5, `rgba(196, 167, 255, ${alpha})`);
        fill.addColorStop(1, `rgba(254, 139, 187, ${alpha * 0.85})`);
        g.fillStyle = fill;
        if (!reduced) {
          g.shadowColor = `rgba(139, 92, 246, ${0.55 * glow})`;
          g.shadowBlur = 16 * glow;
        }
        g.beginPath();
        g.roundRect(x, cy - h, barW, h * 2, barW / 2);
        g.fill();
        g.shadowBlur = 0;

        // peak caps
        if (p > 3) {
          g.fillStyle = `rgba(236, 214, 255, ${0.28 + 0.6 * glow})`;
          g.beginPath();
          g.roundRect(x, cy - p - 2.2, barW, 2.2, 1.1);
          g.fill();
          g.beginPath();
          g.roundRect(x, cy + p, barW, 2.2, 1.1);
          g.fill();
        }
      }
    };

    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible && !frame) frame = requestAnimationFrame(tick);
      if (!visible && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });
    intersection.observe(canvas);
    frame = requestAnimationFrame(tick);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      audioEl?.removeEventListener("play", onResume);
      streamSource?.disconnect();
      // element analysers stay wired (one-per-element rule) but the loop is gone
    };
  }, [stream, audioEl, height]);

  return (
    <canvas
      ref={canvasRef}
      data-wave
      className={className}
      style={{ width: "100%", height, display: "block" }}
      aria-hidden="true"
    />
  );
}

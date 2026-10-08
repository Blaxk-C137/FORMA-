/** WAV encoding helpers — the API always speaks 16 kHz mono 16-bit WAV,
 *  so the backend needs no ffmpeg and works identically on every platform. */

export const TARGET_SR = 16000;

function downsampleTo16k(samples: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate === TARGET_SR) return samples;
  const duration = samples.length / sampleRate;
  const targetLen = Math.max(1, Math.round(duration * TARGET_SR));
  const out = new Float32Array(targetLen);
  const ratio = sampleRate / TARGET_SR;
  for (let i = 0; i < targetLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const frac = pos - i0;
    out[i] = samples[i0] * (1 - frac) + samples[i1] * frac;
  }
  return out;
}

export function encodeWav16kMono(samples: Float32Array, sampleRate: number): Blob {
  const pcm = downsampleTo16k(samples, sampleRate);
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_SR, true);
  view.setUint32(28, TARGET_SR * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** Decode any browser-playable audio file into a 16 kHz mono WAV for the API. */
export async function fileToWavBlob(file: File | Blob): Promise<Blob> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audioBuffer = await ctx.decodeAudioData(await file.arrayBuffer());
    const mono = new Float32Array(audioBuffer.length);
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / audioBuffer.numberOfChannels;
    }
    return encodeWav16kMono(mono, audioBuffer.sampleRate);
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

/** Concatenate captured PCM chunks into a 16 kHz mono WAV for the API. */
export function pcmChunksToWavBlob(chunks: Float32Array[], sampleRate: number): Blob {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const joined = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    joined.set(c, off);
    off += c.length;
  }
  return encodeWav16kMono(joined, sampleRate);
}

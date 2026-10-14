import { useCallback, useEffect, useState } from "react";

export type ApiStatus = {
  stt_ready: boolean;
  tts_ready: boolean;
  stt_model?: string;
  tts_model?: string;
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const OFFLINE_ERROR =
  "The local speech backend is not connected yet. This build never substitutes cloud speech APIs.";

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function useSpeechApi() {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/status", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("status endpoint unavailable");
        const body = await parseJson(res);
        setStatus({
          stt_ready: Boolean(body.stt_ready),
          tts_ready: Boolean(body.tts_ready),
          stt_model: typeof body.stt_model === "string" ? body.stt_model : undefined,
          tts_model: typeof body.tts_model === "string" ? body.tts_model : undefined,
        });
      })
      .catch(() => setStatus(null))
      .finally(() => setChecking(false));
    return () => controller.abort();
  }, []);

  const transcribe = useCallback(
    async (audio: Blob, filename: string, language: string): Promise<ApiResult<{ text: string; language?: string; duration_ms?: number }>> => {
      if (!status?.stt_ready) return { ok: false, error: OFFLINE_ERROR };
      const form = new FormData();
      form.append("audio", audio, filename);
      form.append("language", language);
      try {
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        const body = await parseJson(res);
        if (!res.ok) {
          return { ok: false, error: typeof body.detail === "string" ? body.detail : "Transcription failed on the local model." };
        }
        return {
          ok: true,
          data: {
            text: String(body.text ?? ""),
            language: typeof body.language === "string" ? body.language : undefined,
            duration_ms: typeof body.duration_ms === "number" ? body.duration_ms : undefined,
          },
        };
      } catch {
        return { ok: false, error: "The local backend could not be reached." };
      }
    },
    [status],
  );

  const synthesize = useCallback(
    async (text: string, voice: string, pace: number): Promise<ApiResult<{ audio: Blob }>> => {
      if (!status?.tts_ready) return { ok: false, error: OFFLINE_ERROR };
      try {
        const res = await fetch("/api/synthesize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice, length_scale: 2 - pace }),
        });
        if (!res.ok) {
          const body = await parseJson(res);
          return { ok: false, error: typeof body.detail === "string" ? body.detail : "Speech generation failed on the local voice model." };
        }
        return { ok: true, data: { audio: await res.blob() } };
      } catch {
        return { ok: false, error: "The local backend could not be reached." };
      }
    },
    [status],
  );

  return { status, checking, transcribe, synthesize };
}

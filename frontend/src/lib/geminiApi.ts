import type { SearchSource } from "@/lib/tavilyApi";

export type GeminiSettings = {
  configured: boolean;
  vault_available: boolean;
  key_source?: "credential-vault" | "environment" | null;
  model_default: string;
  message?: string;
};

export type GeminiSearchSummary = {
  text: string;
  model: string;
};

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function getGeminiSettings(): Promise<GeminiSettings> {
  const response = await fetch("/api/gemini/settings");
  const body = await responseJson(response);
  if (!response.ok) throw new Error(String(body.detail ?? "Could not load Gemini settings."));
  return {
    configured: Boolean(body.configured),
    vault_available: Boolean(body.vault_available),
    key_source: body.key_source === "environment" || body.key_source === "credential-vault" ? body.key_source : null,
    model_default: typeof body.model_default === "string" ? body.model_default : "gemini-3.5-flash-lite",
    message: typeof body.message === "string" ? body.message : undefined,
  };
}

export async function saveGeminiKey(apiKey: string): Promise<GeminiSettings> {
  const response = await fetch("/api/gemini/key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });
  const body = await responseJson(response);
  if (!response.ok) throw new Error(String(body.detail ?? "Could not save Gemini API key."));
  return getGeminiSettings();
}

export async function removeGeminiKey(): Promise<GeminiSettings> {
  const response = await fetch("/api/gemini/key", { method: "DELETE" });
  const body = await responseJson(response);
  if (!response.ok) throw new Error(String(body.detail ?? "Could not remove Gemini API key."));
  return getGeminiSettings();
}

export async function refurbishText(text: string, model: string): Promise<string> {
  const response = await fetch("/api/gemini/refurbish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, model }),
  });
  const body = await responseJson(response);
  if (!response.ok) throw new Error(String(body.detail ?? "Gemini could not refurbish this text."));
  return String(body.text ?? "");
}

export async function summarizeTavilyResults(query: string, results: SearchSource[], model: string): Promise<GeminiSearchSummary> {
  const response = await fetch("/api/gemini/summarize-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, results, model }),
  });
  const body = await responseJson(response);
  if (!response.ok) throw new Error(String(body.detail ?? "Gemini could not summarize these search results."));
  return {
    text: String(body.text ?? ""),
    model: String(body.model ?? model),
  };
}

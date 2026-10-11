export type GeminiModelOption = {
  id: string;
  name: string;
  tier: "Fastest value" | "Lowest token cost" | "Balanced" | "Most capable";
  description: string;
  freeTier: string;
  paidInput: string;
  paidOutput: string;
};

/** Stable Gemini API text-generation models for optional refurbishment and search summaries.
 * Checked against Google's public model and pricing pages on 10 Oct 2026.
 * Preview-only and access-restricted legacy models are intentionally omitted.
 */
export const GEMINI_MODELS: GeminiModelOption[] = [
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash-Lite",
    tier: "Fastest value",
    description: "Recommended for quick text refurbishment and everyday search summaries.",
    freeTier: "Text input/output: free tier",
    paidInput: "$0.30 / 1M input tokens",
    paidOutput: "$2.50 / 1M output tokens",
  },
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash-Lite",
    tier: "Lowest token cost",
    description: "Lowest text-token rates in this list; a previous-generation stable option.",
    freeTier: "Text input/output: free tier",
    paidInput: "$0.25 / 1M text input tokens",
    paidOutput: "$1.50 / 1M output tokens",
  },
  {
    id: "gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    tier: "Balanced",
    description: "Stable previous-generation Flash model for stronger reasoning.",
    freeTier: "Text input/output: free tier",
    paidInput: "$0.75 / 1M tokens through 31 Dec 2026; $1.50 from 1 Jan 2027",
    paidOutput: "$3.75 / 1M tokens through 31 Dec 2026; $7.50 from 1 Jan 2027",
  },
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    tier: "Most capable",
    description: "Newest stable Flash model; best when you want more reasoning headroom.",
    freeTier: "Text input/output: free tier",
    paidInput: "$0.75 / 1M tokens through 31 Dec 2026; $1.50 from 1 Jan 2027",
    paidOutput: "$3.75 / 1M tokens through 31 Dec 2026; $7.50 from 1 Jan 2027",
  },
];

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_MODEL_STORAGE_KEY = "forma-gemini-model";

export function readGeminiModel(): string {
  try {
    const saved = localStorage.getItem(GEMINI_MODEL_STORAGE_KEY);
    if (saved && GEMINI_MODELS.some((model) => model.id === saved)) return saved;
  } catch {
    // Private browsing can disable local storage.
  }
  return DEFAULT_GEMINI_MODEL;
}

import { ExternalLink, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GeminiSettings } from "@/lib/geminiApi";
import { getGeminiSettings, removeGeminiKey, saveGeminiKey } from "@/lib/geminiApi";
import { GEMINI_MODELS } from "@/lib/geminiModels";

type SettingsPageProps = {
  model: string;
  onModelChange: (model: string) => void;
  gemini: GeminiSettings | null;
  onGeminiRefresh: (settings: GeminiSettings) => void;
  onToast: (message: string) => void;
  onTerms: () => void;
};

export function SettingsPage({ model, onModelChange, gemini, onGeminiRefresh, onToast, onTerms }: SettingsPageProps) {
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [removingKey, setRemovingKey] = useState(false);
  const [loading, setLoading] = useState(!gemini);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void getGeminiSettings().then((settings) => {
      if (!live) return;
      onGeminiRefresh(settings);
      setError("");
    }).catch((reason: unknown) => {
      if (live) setError(reason instanceof Error ? reason.message : "Could not load Gemini settings.");
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [onGeminiRefresh]);

  const handleSaveKey = async () => {
    if (!key.trim()) return setError("Paste your Gemini API key first.");
    setSavingKey(true);
    setError("");
    try {
      const settings = await saveGeminiKey(key.trim());
      onGeminiRefresh(settings);
      setKey("");
      setShowKey(false);
      onToast("Gemini key verified and saved to the OS credential vault.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not verify or save the key.");
    } finally {
      setSavingKey(false);
    }
  };

  const handleRemoveKey = async () => {
    if (!window.confirm("Remove the saved Gemini API key from this user's OS credential vault?")) return;
    setRemovingKey(true);
    setError("");
    try {
      const settings = await removeGeminiKey();
      onGeminiRefresh(settings);
      onToast("Saved Gemini key removed.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove the saved key.");
    } finally {
      setRemovingKey(false);
    }
  };

  const selectedModel = GEMINI_MODELS.find((item) => item.id === model) ?? GEMINI_MODELS[0];
  const environmentManaged = gemini?.key_source === "environment";

  return (
    <div className="page-stack settings-page">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow"><Sparkles className="h-3.5 w-3.5" /> PREFERENCES</div>
          <h1 className="page-title">Settings<span className="text-violet">.</span></h1>
          <p className="page-subtitle">Connect Gemini only if you want text refurbishment or grounded web search.</p>
        </div>
      </div>

      <section className="settings-card">
        <div className="settings-card-head">
          <div className="flex items-center gap-3"><span className="settings-icon"><KeyRound className="h-4 w-4" /></span><div><h2>Gemini API key</h2><p>Optional · saved on this machine</p></div></div>
          {loading ? <Badge variant="outline">CHECKING…</Badge> : <Badge variant="outline" className={gemini?.configured ? "status-good" : ""}>{gemini?.configured ? "CONNECTED" : "NOT SET UP"}</Badge>}
        </div>
        <div className="settings-card-body">
          {environmentManaged ? (
            <div className="notice-card"><ShieldCheck className="h-4 w-4 text-violet" /><p>This key is supplied through <code>FORMA_GEMINI_API_KEY</code>. It is not displayed here or saved to browser storage; update the environment variable to rotate or remove it.</p></div>
          ) : (
            <>
              <label htmlFor="gemini-key" className="field-label">API key</label>
              <div className="key-field">
                <input id="gemini-key" type={showKey ? "text" : "password"} value={key} onChange={(event) => setKey(event.target.value)} autoComplete="new-password" spellCheck={false} placeholder={gemini?.configured ? "Saved key hidden — paste a replacement to rotate it" : "Paste your Gemini API key"} disabled={savingKey || !gemini?.vault_available} />
                <button type="button" className="icon-action" aria-label={showKey ? "Hide API key" : "Show API key"} onClick={() => setShowKey((value) => !value)}><>{showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</></button>
              </div>
              <div className="key-actions">
                <Button onClick={() => void handleSaveKey()} disabled={savingKey || !key.trim() || !gemini?.vault_available} className="gap-2">
                  {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {savingKey ? "Verifying & saving…" : "Verify & save key"}
                </Button>
                {gemini?.configured ? <Button variant="outline" onClick={() => void handleRemoveKey()} disabled={removingKey} className="gap-2">{removingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Remove saved key</Button> : null}
              </div>
              <p className="field-help">Your key is sent to Google's model-list endpoint to verify it, then saved by the local Python backend in the OS credential vault (Windows Credential Manager on Windows). Forma never returns the saved key to the browser or writes it to localStorage.</p>
              {!gemini?.vault_available ? <div className="notice-card notice-warning"><KeyRound className="h-4 w-4" /><p>The OS credential vault is not available in this environment, so key entry is disabled rather than saving the secret insecurely. On Windows, enable Credential Manager or set <code>FORMA_GEMINI_API_KEY</code> as a user environment variable.</p></div> : null}
            </>
          )}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="privacy-callout"><ShieldCheck className="h-4 w-4 shrink-0 text-violet" /><p>Transcription stays local. Refurbishment sends transcript text only after you click <strong>Refurbish with Gemini</strong>. Voice search first transcribes with local Whisper; only the query text is sent to Google after you click Search.</p></div>
          <a className="external-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Get a Gemini API key <ExternalLink className="h-3.5 w-3.5" /></a>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-head">
          <div className="flex items-center gap-3"><span className="settings-icon"><Sparkles className="h-4 w-4" /></span><div><h2>Gemini model</h2><p>Stable text models · selection saved in this browser</p></div></div>
          <Badge variant="outline">{selectedModel.tier.toUpperCase()}</Badge>
        </div>
        <div className="settings-card-body">
          <label htmlFor="gemini-model" className="field-label">Choose a model</label>
          <select id="gemini-model" value={model} onChange={(event) => { onModelChange(event.target.value); onToast("Gemini model preference saved."); }} className="select-control model-select">
            {GEMINI_MODELS.map((option) => <option key={option.id} value={option.id}>{option.name} — {option.tier}</option>)}
          </select>
          <p className="field-help">{selectedModel.description} These are stable endpoints that currently support both text generation and Google Search grounding. Access still depends on the Google project, region, billing tier, quota, and model availability.</p>
          <div className="model-price-grid">
            {GEMINI_MODELS.map((option) => (
              <button key={option.id} type="button" className={`model-price-card ${model === option.id ? "selected" : ""}`} aria-pressed={model === option.id} onClick={() => { onModelChange(option.id); onToast(`${option.name} selected.`); }}>
                <span className="model-card-title">{option.name}</span>
                <span className="model-card-free">{option.freeTier}</span>
                <span className="model-card-price">Paid: {option.paidInput} · {option.paidOutput}</span>
              </button>
            ))}
          </div>
          <div className="notice-card"><Sparkles className="h-4 w-4 text-violet" /><p>Google currently lists free input/output token use for these stable models on its free API tier; free-tier limits apply and Google may use submitted prompts/outputs to improve products. Google Search grounding is not available via the API free tier: paid-tier projects currently get 5,000 grounding requests/month, then $14 per 1,000. Grounding results are not kept in Forma history.</p></div>
          <div className="settings-links">
            <a className="external-link" href="https://ai.google.dev/gemini-api/docs/models" target="_blank" rel="noreferrer">Model availability <ExternalLink className="h-3.5 w-3.5" /></a>
            <a className="external-link" href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">Live pricing <ExternalLink className="h-3.5 w-3.5" /></a>
            <a className="external-link" href="https://ai.google.dev/gemini-api/docs/available-regions" target="_blank" rel="noreferrer">Available regions <ExternalLink className="h-3.5 w-3.5" /></a>
          </div>
        </div>
      </section>

      <section className="settings-inline-link">
        <div><h2>Terms & privacy</h2><p>Read what stays local, what leaves for Gemini, and the Google API search rules.</p></div>
        <Button variant="outline" onClick={onTerms}>Open terms & privacy</Button>
      </section>
    </div>
  );
}

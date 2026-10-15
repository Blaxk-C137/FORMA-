import { ExternalLink, Eye, EyeOff, KeyRound, Loader2, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GeminiSettings } from "@/lib/geminiApi";
import { getGeminiSettings, removeGeminiKey, saveGeminiKey } from "@/lib/geminiApi";
import { GEMINI_MODELS } from "@/lib/geminiModels";
import { HOSTED_SPEECH_MODE } from "@/lib/deployment";

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
          <p className="page-subtitle">Web results use Tavily's free, keyless search. Gemini is optional for text refurbishment and summaries.</p>
        </div>
      </div>

      <section className="settings-card">
        <div className="settings-card-head">
          <div className="flex items-center gap-3"><span className="settings-icon"><KeyRound className="h-4 w-4" /></span><div><h2>Gemini API key</h2><p>{HOSTED_SPEECH_MODE ? "Optional · set in Render Environment" : "Optional · saved on this machine"}</p></div></div>
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
              {!gemini?.vault_available ? <div className="notice-card notice-warning"><KeyRound className="h-4 w-4" /><p>{HOSTED_SPEECH_MODE ? <>The server credential vault is unavailable. To enable Gemini, add <code>FORMA_GEMINI_API_KEY</code> as a secret in Render's Environment settings; do not place it in browser code.</> : <>The OS credential vault is not available in this environment, so key entry is disabled rather than saving the secret insecurely. On Windows, enable Credential Manager or set <code>FORMA_GEMINI_API_KEY</code> as a user environment variable.</>}</p></div> : null}
            </>
          )}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="privacy-callout"><ShieldCheck className="h-4 w-4 shrink-0 text-violet" /><p>{HOSTED_SPEECH_MODE ? "Speech audio is sent to this Render service for local Whisper/Piper inference. " : "Speech transcription stays on this device. "}Refurbishment sends transcript text only after you click <strong>Refurbish with Gemini</strong>. Search sends the query to Tavily; Gemini summary additionally sends the query and returned titles, URLs, and snippets (not full pages) to Google for text generation. Provider data-use and retention terms apply; Forma does not use Google Search grounding.</p></div>
          <a className="external-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Get a Gemini API key <ExternalLink className="h-3.5 w-3.5" /></a>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-head">
          <div className="flex items-center gap-3"><span className="settings-icon"><Search className="h-4 w-4" /></span><div><h2>Free web search</h2><p>Tavily keyless · no account or API key · rate-limited</p></div></div>
          <Badge variant="outline" className="status-good">FREE MODE</Badge>
        </div>
        <div className="settings-card-body">
          <div className="notice-card"><ShieldCheck className="h-4 w-4 text-violet" /><p>Forma sends your query to Tavily only after you click Search. Keyless search is documented as free and needs no account, API key, or payment card. Tavily returns structured titles, links, and snippets; its privacy policy permits retention as needed to provide/improve its services and limited sharing with search-index providers. Forma does not request a generated answer.</p></div>
          <p className="field-help">Keyless access is rate-limited and may be temporarily unavailable when busy. If needed, Tavily also documents an optional free API-key plan with 1,000 credits per month and no card; a basic search costs one credit. Forma does not add a paid search plan or configure a billing method.</p>
          <div className="privacy-callout"><ShieldCheck className="h-4 w-4 shrink-0 text-violet" /><p>Search is not local: Tavily receives the query and may retain it as needed to provide/improve its service, with limited sharing to search-index providers. If selected, Gemini receives the query plus returned titles, URLs, and snippets for ordinary text generation. Google's data-use and retention terms apply; no Search grounding is called. Avoid sensitive searches.</p></div>
          <div className="settings-links">
            <a className="external-link" href="https://docs.tavily.com/documentation/keyless" target="_blank" rel="noreferrer">Tavily keyless-search details <ExternalLink className="h-3.5 w-3.5" /></a>
            <a className="external-link" href="https://docs.tavily.com/documentation/api-credits" target="_blank" rel="noreferrer">Free credits and limits <ExternalLink className="h-3.5 w-3.5" /></a>
            <a className="external-link" href="https://www.tavily.com/privacy" target="_blank" rel="noreferrer">Tavily privacy and retention policy <ExternalLink className="h-3.5 w-3.5" /></a>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-head">
          <div className="flex items-center gap-3"><span className="settings-icon"><Sparkles className="h-4 w-4" /></span><div><h2>Gemini model</h2><p>For optional refurbishment and Tavily-result summaries</p></div></div>
          <Badge variant="outline">{selectedModel.tier.toUpperCase()}</Badge>
        </div>
        <div className="settings-card-body">
          <label htmlFor="gemini-model" className="field-label">Choose a model</label>
          <select id="gemini-model" value={model} onChange={(event) => { onModelChange(event.target.value); onToast("Gemini model preference saved."); }} className="select-control model-select">
            {GEMINI_MODELS.map((option) => <option key={option.id} value={option.id}>{option.name} — {option.tier}</option>)}
          </select>
          <p className="field-help">{selectedModel.description} These stable text-generation models are used only when you click Gemini refurbishment or choose a Gemini summary. Forma uses Tavily—not Google's Search-grounding tool—for web retrieval.</p>
          <div className="model-price-grid">
            {GEMINI_MODELS.map((option) => (
              <button key={option.id} type="button" className={`model-price-card ${model === option.id ? "selected" : ""}`} aria-pressed={model === option.id} onClick={() => { onModelChange(option.id); onToast(`${option.name} selected.`); }}>
                <span className="model-card-title">{option.name}</span>
                <span className="model-card-free">{option.freeTier}</span>
                <span className="model-card-price">Paid: {option.paidInput} · {option.paidOutput}</span>
              </button>
            ))}
          </div>
          <div className="notice-card"><Sparkles className="h-4 w-4 text-violet" /><p>Gemini is optional and runs only after your action. Google may charge ordinary text-token rates and applies project/model quotas. Its unpaid tier may use submitted content and responses for product improvement and human review; paid-tier content is excluded from product-improvement use. Google's abuse-monitoring policy currently states 55-day retention for prompts, context, and outputs. See Terms & privacy for the linked policies. Forma does not call Search grounding.</p></div>
          <div className="settings-links">
            <a className="external-link" href="https://ai.google.dev/gemini-api/docs/models" target="_blank" rel="noreferrer">Model availability <ExternalLink className="h-3.5 w-3.5" /></a>
            <a className="external-link" href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">Live pricing <ExternalLink className="h-3.5 w-3.5" /></a>
            <a className="external-link" href="https://ai.google.dev/gemini-api/docs/available-regions" target="_blank" rel="noreferrer">Available regions <ExternalLink className="h-3.5 w-3.5" /></a>
            <a className="external-link" href="https://ai.google.dev/gemini-api/docs/usage-policies" target="_blank" rel="noreferrer">Data-use and retention policy <ExternalLink className="h-3.5 w-3.5" /></a>
          </div>
        </div>
      </section>

      <section className="settings-inline-link">
        <div><h2>Terms & privacy</h2><p>Read what stays local, what Tavily receives, and when text is sent to Gemini.</p></div>
        <Button variant="outline" onClick={onTerms}>Open terms & privacy</Button>
      </section>
    </div>
  );
}

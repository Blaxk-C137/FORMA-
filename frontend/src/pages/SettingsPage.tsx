import { ExternalLink, Eye, EyeOff, Globe2, KeyRound, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GoogleAgentSearchSettings } from "@/lib/agentSearchApi";
import { getGoogleAgentSearchSettings, removeGoogleAgentSearchSettings, saveGoogleAgentSearchSettings } from "@/lib/agentSearchApi";
import type { GeminiSettings } from "@/lib/geminiApi";
import { getGeminiSettings, removeGeminiKey, saveGeminiKey } from "@/lib/geminiApi";
import { GEMINI_MODELS } from "@/lib/geminiModels";

type SettingsPageProps = {
  model: string;
  onModelChange: (model: string) => void;
  gemini: GeminiSettings | null;
  onGeminiRefresh: (settings: GeminiSettings) => void;
  agentSearch: GoogleAgentSearchSettings | null;
  onAgentSearchRefresh: (settings: GoogleAgentSearchSettings) => void;
  onToast: (message: string) => void;
  onTerms: () => void;
};

export function SettingsPage({ model, onModelChange, gemini, onGeminiRefresh, agentSearch, onAgentSearchRefresh, onToast, onTerms }: SettingsPageProps) {
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [removingKey, setRemovingKey] = useState(false);
  const [loading, setLoading] = useState(!gemini);
  const [error, setError] = useState("");
  const [agentKey, setAgentKey] = useState("");
  const [showAgentKey, setShowAgentKey] = useState(false);
  const [agentProject, setAgentProject] = useState(agentSearch?.project_id ?? "");
  const [agentEngine, setAgentEngine] = useState(agentSearch?.engine_id ?? "");
  const [agentLocation, setAgentLocation] = useState<"global" | "us" | "eu">(agentSearch?.location ?? "global");
  const [savingAgent, setSavingAgent] = useState(false);
  const [removingAgent, setRemovingAgent] = useState(false);
  const [agentError, setAgentError] = useState("");

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

  useEffect(() => {
    let live = true;
    void getGoogleAgentSearchSettings().then((settings) => {
      if (live) onAgentSearchRefresh(settings);
    }).catch((reason: unknown) => {
      if (live) setAgentError(reason instanceof Error ? reason.message : "Could not load Google Agent Search settings.");
    });
    return () => { live = false; };
  }, [onAgentSearchRefresh]);

  useEffect(() => {
    if (!agentSearch) return;
    setAgentProject(agentSearch.project_id);
    setAgentEngine(agentSearch.engine_id);
    setAgentLocation(agentSearch.location);
  }, [agentSearch]);

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

  const handleSaveAgent = async () => {
    if (!agentKey.trim()) return setAgentError("Paste a Google Cloud API key first.");
    if (!agentProject.trim() || !agentEngine.trim()) return setAgentError("Enter both the Google Cloud project ID and Agent Search app/engine ID.");
    setSavingAgent(true);
    setAgentError("");
    try {
      const settings = await saveGoogleAgentSearchSettings({
        api_key: agentKey.trim(),
        project_id: agentProject.trim(),
        engine_id: agentEngine.trim(),
        location: agentLocation,
      });
      onAgentSearchRefresh(settings);
      setAgentKey("");
      setShowAgentKey(false);
      onToast("Google Agent Search settings saved in the OS credential vault. No query has been sent.");
    } catch (reason) {
      setAgentError(reason instanceof Error ? reason.message : "Could not save Google Agent Search settings.");
    } finally {
      setSavingAgent(false);
    }
  };

  const handleRemoveAgent = async () => {
    if (!window.confirm("Remove Google Agent Search credentials and configuration from this user's OS credential vault?")) return;
    setRemovingAgent(true);
    setAgentError("");
    try {
      const settings = await removeGoogleAgentSearchSettings();
      onAgentSearchRefresh(settings);
      setAgentKey("");
      onToast("Google Agent Search credentials removed.");
    } catch (reason) {
      setAgentError(reason instanceof Error ? reason.message : "Could not remove Google Agent Search settings.");
    } finally {
      setRemovingAgent(false);
    }
  };

  const selectedModel = GEMINI_MODELS.find((item) => item.id === model) ?? GEMINI_MODELS[0];
  const environmentManaged = gemini?.key_source === "environment";
  const agentEnvironmentManaged = agentSearch?.key_source === "environment";

  return (
    <div className="page-stack settings-page">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow"><Sparkles className="h-3.5 w-3.5" /> PREFERENCES</div>
          <h1 className="page-title">Settings<span className="text-violet">.</span></h1>
          <p className="page-subtitle">Gemini powers text refurbishment and grounded search; Google Agent Search can return direct results from your configured public sites.</p>
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
          <div className="flex items-center gap-3"><span className="settings-icon"><Globe2 className="h-4 w-4" /></span><div><h2>Google Agent Search</h2><p>Direct structured results · searches the public sites in your configured Agent Search app</p></div></div>
          {!agentSearch ? <Badge variant="outline">CHECKING…</Badge> : <Badge variant="outline" className={agentSearch.configured ? "status-good" : ""}>{agentSearch.configured ? "CONFIGURED" : "NOT SET UP"}</Badge>}
        </div>
        <div className="settings-card-body">
          {agentEnvironmentManaged ? (
            <div className="notice-card"><ShieldCheck className="h-4 w-4 text-violet" /><p>This provider is managed through <code>FORMA_AGENT_SEARCH_*</code> environment variables. Secret values are not displayed in Forma; update the environment variables to rotate or remove them.</p></div>
          ) : (
            <>
              <label htmlFor="agent-search-project" className="field-label">Google Cloud project ID</label>
              <input id="agent-search-project" className="text-field" value={agentProject} onChange={(event) => setAgentProject(event.target.value)} placeholder="my-cloud-project" autoComplete="off" spellCheck={false} disabled={!agentSearch?.vault_available || savingAgent} />
              <label htmlFor="agent-search-engine" className="field-label">Agent Search app / engine ID</label>
              <input id="agent-search-engine" className="text-field" value={agentEngine} onChange={(event) => setAgentEngine(event.target.value)} placeholder="my-public-sites-app" autoComplete="off" spellCheck={false} disabled={!agentSearch?.vault_available || savingAgent} />
              <label htmlFor="agent-search-location" className="field-label">App location</label>
              <select id="agent-search-location" className="select-control model-select" value={agentLocation} onChange={(event) => setAgentLocation(event.target.value as "global" | "us" | "eu")} disabled={!agentSearch?.vault_available || savingAgent}>
                <option value="global">global</option><option value="us">us</option><option value="eu">eu</option>
              </select>
              <label htmlFor="agent-search-key" className="field-label">Google Cloud API key</label>
              <div className="key-field">
                <input id="agent-search-key" type={showAgentKey ? "text" : "password"} value={agentKey} onChange={(event) => setAgentKey(event.target.value)} autoComplete="new-password" spellCheck={false} placeholder={agentSearch?.configured ? "Saved key hidden — paste a replacement to rotate it" : "Paste an API key restricted to Discovery Engine"} disabled={!agentSearch?.vault_available || savingAgent} />
                <button type="button" className="icon-action" aria-label={showAgentKey ? "Hide Google API key" : "Show Google API key"} onClick={() => setShowAgentKey((value) => !value)} disabled={!agentSearch?.vault_available}><>{showAgentKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</></button>
              </div>
              <div className="key-actions">
                <Button onClick={() => void handleSaveAgent()} disabled={savingAgent || !agentKey.trim() || !agentSearch?.vault_available} className="gap-2">
                  {savingAgent ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {savingAgent ? "Saving securely…" : "Save Google Search setup"}
                </Button>
                {agentSearch?.configured ? <Button variant="outline" onClick={() => void handleRemoveAgent()} disabled={removingAgent} className="gap-2">{removingAgent ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Remove saved setup</Button> : null}
              </div>
              <p className="field-help">Create a Google Cloud Agent Search app with a public website data store, enable the Discovery Engine API, and use the project ID, app/engine ID, location, and an API key restricted to Discovery Engine (without an HTTP-referrer restriction; this call is server-side). After you choose Google Search and click Search, the query is sent by the local backend; the key is never returned to the browser. Saving setup does not validate the app or run/bill a query; the first search tests the connection.</p>
              {!agentSearch?.vault_available ? <div className="notice-card notice-warning"><KeyRound className="h-4 w-4" /><p>The OS credential vault is unavailable here, so key entry is disabled. On Windows, use Credential Manager; for managed installs set <code>FORMA_AGENT_SEARCH_API_KEY</code>, <code>FORMA_AGENT_SEARCH_PROJECT_ID</code>, and <code>FORMA_AGENT_SEARCH_ENGINE_ID</code> (optional <code>FORMA_AGENT_SEARCH_LOCATION</code>).</p></div> : null}
            </>
          )}
          {agentError ? <p className="form-error" role="alert">{agentError}</p> : null}
          <div className="notice-card"><Globe2 className="h-4 w-4 text-violet" /><p>Google Agent Search returns clean title, URL, and snippet cards from the public websites indexed by your configured app; it is not unrestricted Google Web Search. Cloud quotas and charges can apply. Review the setup and current pricing before enabling it.</p></div>
          <div className="settings-links">
            <a className="external-link" href="https://docs.cloud.google.com/generative-ai-app-builder/docs/try-enterprise-search" target="_blank" rel="noreferrer">Create a public-site Search app <ExternalLink className="h-3.5 w-3.5" /></a>
            <a className="external-link" href="https://docs.cloud.google.com/generative-ai-app-builder/docs/preview-search-results" target="_blank" rel="noreferrer">Search API setup <ExternalLink className="h-3.5 w-3.5" /></a>
            <a className="external-link" href="https://cloud.google.com/generative-ai-app-builder/pricing" target="_blank" rel="noreferrer">Agent Search pricing <ExternalLink className="h-3.5 w-3.5" /></a>
          </div>
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

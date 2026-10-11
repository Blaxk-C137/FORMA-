import { Check, Copy, Loader2, Sparkles, Trash2, Undo2, X } from "lucide-react";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExportMenu } from "@/components/ExportMenu";
import type { ExportFormat } from "@/lib/export";

type TranscriptCardProps = {
  value: string;
  onChange: (next: string) => void;
  status: string;
  onToast: (message: string) => void;
  geminiConfigured: boolean;
  refurbishing: boolean;
  suggestion: string;
  onRefurbish: () => void;
  onApplySuggestion: () => void;
  onDiscardSuggestion: () => void;
  onExport: (format: ExportFormat, text?: string) => void;
  onGoToSettings: () => void;
};

export function TranscriptCard({
  value,
  onChange,
  status,
  onToast,
  geminiConfigured,
  refurbishing,
  suggestion,
  onRefurbish,
  onApplySuggestion,
  onDiscardSuggestion,
  onExport,
  onGoToSettings,
}: TranscriptCardProps) {
  const historyRef = useRef<string[]>([]);
  const lastRef = useRef("");
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;

  const updateText = (next: string) => {
    if (next !== value) historyRef.current.push(value);
    if (historyRef.current.length > 100) historyRef.current.shift();
    lastRef.current = next;
    onChange(next);
  };

  return (
    <section className="panel transcript-card" id="transcript" aria-label="Transcript editor">
      <div className="panel-head">
        <span className="step-chip"><span className="step">02</span> Transcript</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Undo edit" title="Undo edit" onClick={() => {
            const previous = historyRef.current.pop();
            if (previous === undefined) return onToast("Nothing to undo yet.");
            lastRef.current = previous;
            onChange(previous);
          }}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Clear transcript text" title="Clear transcript text" onClick={() => {
            if (!value) return;
            updateText("");
            onToast("Transcript cleared. The recorded segments are still in this session.");
          }}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Badge variant="outline" className="transcript-status">{status.toUpperCase()}</Badge>
        </div>
      </div>

      <div className="transcript-editor-wrap">
        <textarea
          className="transcript-area"
          aria-label="Editable transcript"
          spellCheck
          placeholder="Your transcript will appear here. Type or edit anything you want to keep."
          value={value}
          onChange={(event) => updateText(event.target.value)}
        />
      </div>

      {suggestion ? (
        <div className="suggestion-card" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium"><Sparkles className="h-4 w-4 text-violet" /> Gemini suggestion</div>
          <div className="flex items-center gap-1"><ExportMenu compact label="Export suggestion" onExport={(format) => onExport(format, suggestion)} /><Button variant="ghost" size="icon" aria-label="Discard Gemini suggestion" onClick={onDiscardSuggestion}><X className="h-4 w-4" /></Button></div>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{suggestion}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" className="gap-2" onClick={onApplySuggestion}><Check className="h-3.5 w-3.5" /> Use this version</Button>
            <Button size="sm" variant="outline" onClick={onDiscardSuggestion}>Keep my original</Button>
            <span className="text-[10px] text-muted-foreground">Review before applying; meaning may change.</span>
          </div>
        </div>
      ) : null}

      <div className="transcript-toolbar">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={!value} className="gap-2" onClick={() => {
            navigator.clipboard.writeText(value).then(() => onToast("Copied to clipboard.")).catch(() => onToast("Clipboard unavailable. Select and copy the text."));
          }}><Copy className="h-3.5 w-3.5" /> Copy</Button>
          <ExportMenu onExport={onExport} disabled={!value} label="Export" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {geminiConfigured ? (
            <Button size="sm" disabled={!value.trim() || refurbishing} className="gap-2" onClick={onRefurbish} title="Send this text to Gemini only when you click">
              {refurbishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {refurbishing ? "Refurbishing…" : "Refurbish with Gemini"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="gap-2" onClick={onGoToSettings}>
              <Sparkles className="h-3.5 w-3.5" /> Set up Gemini
            </Button>
          )}
        </div>
      </div>

      <div className="transcript-foot">
        <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-violet" />{status}</span>
        <span>{words} {words === 1 ? "word" : "words"} · {value.length} characters</span>
      </div>
    </section>
  );
}

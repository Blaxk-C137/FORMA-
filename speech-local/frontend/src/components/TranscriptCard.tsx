import { Copy, Download, Trash2, Undo2 } from "lucide-react";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type TranscriptCardProps = {
  value: string;
  onChange: (next: string) => void;
  status: string;
  onToast: (message: string) => void;
};

export function TranscriptCard({ value, onChange, status, onToast }: TranscriptCardProps) {
  const historyRef = useRef<string[]>([]);
  const lastRef = useRef("");

  const pushHistory = (prev: string) => {
    historyRef.current.push(prev);
    if (historyRef.current.length > 100) historyRef.current.shift();
  };

  const setText = (next: string) => {
    pushHistory(value);
    lastRef.current = next;
    onChange(next);
  };

  const words = value.trim() ? value.trim().split(/\s+/).length : 0;

  return (
    <section className="panel flex flex-col" id="transcript" aria-label="Transcript editor">
      <div className="panel-head">
        <span className="step-chip">
          <span className="step">02</span> Make it yours
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Undo edit"
            title="Undo edit"
            onClick={() => {
              const prev = historyRef.current.pop();
              if (prev === undefined) return onToast("Nothing to undo yet.");
              lastRef.current = prev;
              onChange(prev);
            }}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Clear text"
            title="Clear text"
            onClick={() => {
              setText("");
              onToast("Canvas cleared. Undo will bring it back.");
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Badge variant="outline">TRANSCRIPT</Badge>
        </div>
      </div>

      <div className="flex-1 px-6 pb-3 pt-5">
        <textarea
          className="transcript-area"
          aria-label="Editable transcript"
          spellCheck
          placeholder={"A blank canvas for your voice.\n\nYour transcript will appear here. Or type something worth saying."}
          value={value}
          onChange={(e) => {
            pushHistory(lastRef.current);
            lastRef.current = e.target.value;
            onChange(e.target.value);
          }}
        />
      </div>

      <div className="flex items-center gap-2 px-6 pb-4">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={!value}
          onClick={() => {
            navigator.clipboard
              .writeText(value)
              .then(() => onToast("Copied. Take your words anywhere."))
              .catch(() => onToast("Clipboard unavailable in this context. Select the text and copy."));
          }}
        >
          <Copy className="h-3.5 w-3.5" /> Copy text
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={!value}
          onClick={() => {
            const url = URL.createObjectURL(new Blob([value], { type: "text/plain;charset=utf-8" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = "forma-transcript.txt";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            onToast("Your words, exported.");
          }}
        >
          <Download className="h-3.5 w-3.5" /> Export .txt
        </Button>
      </div>

      <div className="flex items-center justify-between border-t border-border px-6 py-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-violet" />
          {status}
        </span>
        <span>
          {words} {words === 1 ? "word" : "words"} · {value.length} characters
        </span>
      </div>
    </section>
  );
}

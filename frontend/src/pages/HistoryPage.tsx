import { Clock3, FileClock, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { ExportMenu } from "@/components/ExportMenu";
import { Button } from "@/components/ui/button";
import { sessionWordCount, type SessionRecord } from "@/lib/history";
import { type ExportFormat } from "@/lib/export";

type HistoryPageProps = {
  sessions: SessionRecord[];
  onOpen: (session: SessionRecord) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onExport: (rows: SessionRecord[], format: ExportFormat) => void;
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function HistoryPage({ sessions, onOpen, onDelete, onClear, onExport }: HistoryPageProps) {
  const [filter, setFilter] = useState("");
  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return sessions;
    return sessions.filter((row) => `${row.title} ${row.transcript}`.toLowerCase().includes(term));
  }, [filter, sessions]);

  return (
    <div className="page-stack">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow"><Clock3 className="h-3.5 w-3.5" /> SESSION ARCHIVE</div>
          <h1 className="page-title">History<span className="text-violet">.</span></h1>
          <p className="page-subtitle">Your transcripts are saved on this device. Search, reopen, export, or clear them.</p>
        </div>
        <div className="history-tools">
          <ExportMenu label="Export all" disabled={!sessions.length} onExport={(format) => onExport(sessions, format)} />
          <Button variant="outline" size="sm" disabled={!sessions.length} className="gap-2 text-destructive" onClick={() => {
            if (window.confirm("Clear all saved transcript sessions from this browser? This cannot be undone.")) onClear();
          }}><Trash2 className="h-3.5 w-3.5" /> Clear all</Button>
        </div>
      </div>
      <label className="history-search"><Search className="h-4 w-4 text-muted-foreground" /><input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Find words or a session title…" aria-label="Search session history" /><span>{visible.length} / {sessions.length}</span></label>
      {visible.length ? (
        <div className="history-list">{visible.map((session) => {
          const words = sessionWordCount(session.transcript);
          return <article key={session.id} className="history-item">
            <div className="history-item-main"><div className="flex items-start gap-3"><span className="history-icon"><FileClock className="h-4 w-4" /></span><div className="min-w-0 flex-1">
              <h2 className="history-title">{session.title}</h2>
              <div className="history-meta">{formatDate(session.updatedAt)} <span>·</span> {words} {words === 1 ? "word" : "words"} <span>·</span> {session.segmentCount} audio {session.segmentCount === 1 ? "part" : "parts"}</div>
              {session.transcript ? <p className="history-preview">{session.transcript.slice(0, 260)}{session.transcript.length > 260 ? "…" : ""}</p> : <p className="history-preview italic">No transcript text in this session.</p>}
            </div></div></div>
            <div className="history-actions"><Button size="sm" onClick={() => onOpen(session)}>Open in studio</Button><ExportMenu label={`Export ${session.id.slice(0, 5)}`} compact onExport={(format) => onExport([session], format)} /><Button size="icon" variant="ghost" aria-label={`Delete ${session.title}`} title="Delete session" onClick={() => onDelete(session.id)}><Trash2 className="h-4 w-4" /></Button></div>
          </article>;
        })}</div>
      ) : <div className="empty-state"><FileClock className="h-8 w-8 text-violet" /><h2>{sessions.length ? "No matching sessions" : "Your archive is ready"}</h2><p>{sessions.length ? "Try a different search term." : "Transcripts are saved here as you work. Search results are intentionally not stored in history."}</p></div>}
    </div>
  );
}

import { sessionWordCount, type SessionRecord } from "@/lib/history";

export type ExportFormat = "txt" | "md" | "json" | "csv" | "html" | "pdf";

export const EXPORT_FORMATS: { id: ExportFormat; label: string }[] = [
  { id: "txt", label: "Plain text (.txt)" },
  { id: "md", label: "Markdown (.md)" },
  { id: "json", label: "JSON (.json)" },
  { id: "csv", label: "CSV (.csv)" },
  { id: "html", label: "HTML (.html)" },
  { id: "pdf", label: "Print / save as PDF" },
];

export type SearchExport = {
  query: string;
  text: string;
  provider: string;
  model: string;
  total?: number;
  createdAt: string;
  sources: { title: string; uri: string; snippet?: string }[];
};

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "forma-export";
}

function saveFile(content: string, mime: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function printDocument(title: string, body: string): void {
  const w = window.open("", "_blank");
  if (!w) {
    window.alert("Allow pop-ups for Forma, then choose Print / save as PDF again.");
    return;
  }
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>
    body{font:16px/1.65 system-ui,Segoe UI,Arial,sans-serif;color:#15151c;max-width:820px;margin:48px auto;padding:0 28px}
    h1{font-size:26px;line-height:1.2;margin:0 0 10px}h2{font-size:15px;margin:26px 0 8px;color:#57516a}
    .meta{color:#656174;font-size:12px;margin:0 0 28px}pre{font:inherit;white-space:pre-wrap;word-break:break-word;margin:0}
    a{color:#5125a8;overflow-wrap:anywhere}.source{margin:8px 0}
    @media print{body{margin:16mm auto;padding:0}}
  </style></head><body>${body}</body></html>`);
  w.document.close();
  w.focus();
  window.setTimeout(() => w.print(), 250);
}

function makeHtml(title: string, meta: string, content: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title><style>body{font:16px/1.7 system-ui,Segoe UI,Arial,sans-serif;max-width:860px;margin:44px auto;padding:0 24px;color:#16151d}h1{line-height:1.2}small{color:#666}pre{font:inherit;white-space:pre-wrap}a{color:#562da4}li{margin:6px 0}</style></head><body><h1>${escHtml(title)}</h1><small>${escHtml(meta)}</small><hr><pre>${escHtml(content)}</pre></body></html>`;
}

export function exportTranscript(text: string, format: ExportFormat, title = "Forma transcript", status = ""): void {
  const now = new Date().toISOString();
  const meta = status ? `${status} · ${sessionWordCount(text)} words · ${now}` : `${sessionWordCount(text)} words · ${now}`;
  const filename = slug(title);
  if (format === "pdf") {
    printDocument(title, `<h1>${escHtml(title)}</h1><p class="meta">${escHtml(meta)}</p><pre>${escHtml(text)}</pre>`);
    return;
  }
  if (format === "json") {
    saveFile(JSON.stringify({ title, status, exportedAt: now, wordCount: sessionWordCount(text), transcript: text }, null, 2), "application/json;charset=utf-8", `${filename}.json`);
  } else if (format === "csv") {
    saveFile(["title,status,exported_at,word_count,transcript", [title, status, now, sessionWordCount(text), text].map(csvCell).join(",")].join("\r\n"), "text/csv;charset=utf-8", `${filename}.csv`);
  } else if (format === "html") {
    saveFile(makeHtml(title, meta, text), "text/html;charset=utf-8", `${filename}.html`);
  } else if (format === "md") {
    saveFile(`# ${title}\n\n_${meta}_\n\n${text}\n`, "text/markdown;charset=utf-8", `${filename}.md`);
  } else {
    saveFile(`${title}\n${meta}\n\n${text}\n`, "text/plain;charset=utf-8", `${filename}.txt`);
  }
}

function sessionText(session: SessionRecord): string {
  return `${session.transcript || "(No transcript text saved)"}`;
}

export function exportSessions(rows: SessionRecord[], format: ExportFormat): void {
  const now = new Date().toISOString();
  const filename = rows.length === 1 ? slug(rows[0].title) : "forma-session-history";
  if (format === "pdf") {
    const body = rows.map((row) => `<section><h1>${escHtml(row.title)}</h1><p class="meta">${escHtml(new Date(row.updatedAt).toLocaleString())} · ${sessionWordCount(row.transcript)} words · ${row.segmentCount} audio segments</p><pre>${escHtml(sessionText(row))}</pre></section>`).join("<hr>" );
    printDocument("Forma session history", body);
    return;
  }
  if (format === "json") {
    saveFile(JSON.stringify({ exportedAt: now, sessions: rows }, null, 2), "application/json;charset=utf-8", `${filename}.json`);
  } else if (format === "csv") {
    const lines = ["id,title,started_at,updated_at,word_count,segment_count,transcript", ...rows.map((row) => [row.id, row.title, row.startedAt, row.updatedAt, sessionWordCount(row.transcript), row.segmentCount, row.transcript].map(csvCell).join(","))];
    saveFile(lines.join("\r\n"), "text/csv;charset=utf-8", `${filename}.csv`);
  } else if (format === "html") {
    const content = rows.map((row) => `<section><h2>${escHtml(row.title)}</h2><small>${escHtml(new Date(row.updatedAt).toLocaleString())} · ${sessionWordCount(row.transcript)} words</small><pre>${escHtml(sessionText(row))}</pre></section>`).join("<hr>");
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Forma session history</title><style>body{font:15px/1.7 system-ui,Arial;max-width:900px;margin:40px auto;padding:0 24px;color:#18171e}h1{font-size:26px}h2{font-size:18px;margin-bottom:4px}small{color:#666}pre{font:inherit;white-space:pre-wrap;word-break:break-word}</style></head><body><h1>Forma session history</h1><small>${rows.length} ${rows.length === 1 ? "session" : "sessions"} · exported ${escHtml(now)}</small>${content}</body></html>`;
    saveFile(html, "text/html;charset=utf-8", `${filename}.html`);
  } else if (format === "md") {
    const content = rows.map((row) => `## ${row.title}\n\n_${new Date(row.updatedAt).toLocaleString()} · ${sessionWordCount(row.transcript)} words · ${row.segmentCount} audio segments_\n\n${sessionText(row)}`).join("\n\n---\n\n");
    saveFile(`# Forma session history\n\n${content}\n`, "text/markdown;charset=utf-8", `${filename}.md`);
  } else {
    const separator = `\n\n${"=".repeat(48)}\n\n`;
    const content = rows.map((row) => `${row.title}\n${new Date(row.updatedAt).toLocaleString()} · ${sessionWordCount(row.transcript)} words · ${row.segmentCount} audio segments\n\n${sessionText(row)}`).join(separator);
    saveFile(`Forma session history · exported ${now}\n\n${content}\n`, "text/plain;charset=utf-8", `${filename}.txt`);
  }
}

export function exportSearchResult(result: SearchExport, format: ExportFormat): void {
  const title = `Search · ${result.query}`;
  const created = new Date(result.createdAt).toLocaleString();
  const provider = result.provider || result.model;
  const totalLabel = typeof result.total === "number" ? ` · ${result.sources.length} shown of ${result.total}` : "";
  const metadata = `${created} · ${provider}${totalLabel}`;
  const sourcesText = result.sources.map((source, index) => `[${index + 1}] ${source.title} — ${source.uri}${source.snippet ? `\n    ${source.snippet}` : ""}`).join("\n");
  if (format === "pdf") {
    const sourcesHtml = result.sources.map((source, index) => `<p class="source">[${index + 1}] <a href="${escHtml(source.uri)}">${escHtml(source.title)}</a>${source.snippet ? `<br><span>${escHtml(source.snippet)}</span>` : ""}</p>`).join("");
    printDocument(title, `<h1>${escHtml(title)}</h1><p class="meta">${escHtml(metadata)}</p>${result.text ? `<pre>${escHtml(result.text)}</pre>` : ""}<h2>Results / sources</h2>${sourcesHtml || "<p>No result links were returned.</p>"}`);
    return;
  }
  if (format === "json") {
    saveFile(JSON.stringify({ query: result.query, provider, answer: result.text || undefined, results: result.sources, totalResults: result.total, model: result.model, exportedAt: new Date().toISOString() }, null, 2), "application/json;charset=utf-8", `${slug(title)}.json`);
  } else if (format === "csv") {
    const rows: unknown[][] = [["query", "provider", "answer", "source_title", "source_url", "snippet", "total_results", "created_at"]];
    if (result.sources.length) result.sources.forEach((source) => rows.push([result.query, provider, result.text, source.title, source.uri, source.snippet ?? "", result.total ?? "", created]));
    else rows.push([result.query, provider, result.text, "", "", "", result.total ?? "", created]);
    saveFile(rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8", `${slug(title)}.csv`);
  } else if (format === "html") {
    const sourcesHtml = result.sources.map((source, index) => `<article><p><a href="${escHtml(source.uri)}">[${index + 1}] ${escHtml(source.title)}</a></p>${source.snippet ? `<p>${escHtml(source.snippet)}</p>` : ""}</article>`).join("");
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>body{font:16px/1.7 system-ui,Arial;max-width:820px;margin:40px auto;padding:0 24px}pre{font:inherit;white-space:pre-wrap}a{color:#562da4}article{margin:18px 0;border-bottom:1px solid #ddd}</style></head><body><h1>${escHtml(title)}</h1><small>${escHtml(metadata)}</small>${result.text ? `<pre>${escHtml(result.text)}</pre>` : ""}<h2>Results / sources</h2>${sourcesHtml || "<p>No result links were returned.</p>"}</body></html>`;
    saveFile(html, "text/html;charset=utf-8", `${slug(title)}.html`);
  } else if (format === "md") {
    saveFile(`# ${title}\n\n_${metadata}_\n\n${result.text ? `${result.text}\n\n` : ""}## Results / sources\n\n${sourcesText || "(No result links were returned.)"}\n`, "text/markdown;charset=utf-8", `${slug(title)}.md`);
  } else {
    saveFile(`${title}\n${metadata}\n\n${result.text ? `${result.text}\n\n` : ""}Results / sources\n${sourcesText || "(No result links were returned.)"}\n`, "text/plain;charset=utf-8", `${slug(title)}.txt`);
  }
}

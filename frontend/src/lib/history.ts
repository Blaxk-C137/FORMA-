export type SessionRecord = {
  id: string;
  startedAt: string;
  updatedAt: string;
  title: string;
  transcript: string;
  textStatus: string;
  segmentCount: number;
};

const HISTORY_KEY = "forma-session-history-v1";
const ACTIVE_KEY = "forma-active-session-v1";
const MAX_SESSIONS = 100;

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or quota exhaustion: the current in-memory session still works.
  }
}

export function readHistory(): SessionRecord[] {
  const rows = safeRead<unknown>(HISTORY_KEY, []);
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is SessionRecord => {
    if (!row || typeof row !== "object") return false;
    const item = row as Partial<SessionRecord>;
    return typeof item.id === "string" && typeof item.updatedAt === "string" && typeof item.transcript === "string";
  });
}

export function readActiveSession(): SessionRecord | null {
  const row = safeRead<unknown>(ACTIVE_KEY, null);
  if (!row || typeof row !== "object") return null;
  const item = row as Partial<SessionRecord>;
  if (typeof item.id !== "string" || typeof item.transcript !== "string") return null;
  return item as SessionRecord;
}

export function persistSession(record: SessionRecord): SessionRecord[] {
  const current = readHistory();
  const next = [record, ...current.filter((item) => item.id !== record.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_SESSIONS);
  safeWrite(HISTORY_KEY, next);
  safeWrite(ACTIVE_KEY, record);
  return next;
}

export function persistHistory(rows: SessionRecord[]): void {
  safeWrite(HISTORY_KEY, rows.slice(0, MAX_SESSIONS));
}

export function clearActiveSession(): void {
  try {
    localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Ignore storage restrictions.
  }
}

export function formatSessionTitle(transcript: string, segmentCount: number, startedAt: string): string {
  const firstLine = transcript.trim().split(/\n/).find(Boolean)?.trim();
  if (firstLine) return firstLine.length > 64 ? `${firstLine.slice(0, 61).trimEnd()}…` : firstLine;
  if (segmentCount > 0) return `Voice session · ${segmentCount} ${segmentCount === 1 ? "segment" : "segments"}`;
  return `Session · ${new Date(startedAt).toLocaleString()}`;
}

export function sessionWordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

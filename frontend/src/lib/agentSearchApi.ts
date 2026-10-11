export type GoogleAgentSearchSettings = {
  configured: boolean;
  vault_available: boolean;
  key_source: "credential-vault" | "environment" | null;
  project_id: string;
  engine_id: string;
  location: "global" | "us" | "eu";
};

export type GoogleAgentSearchResult = {
  provider: "google-agent-search";
  query: string;
  total: number;
  results: { title: string; uri: string; snippet: string }[];
};

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toSettings(body: Record<string, unknown>): GoogleAgentSearchSettings {
  return {
    configured: Boolean(body.configured),
    vault_available: Boolean(body.vault_available),
    key_source: body.key_source === "environment" || body.key_source === "credential-vault" ? body.key_source : null,
    project_id: typeof body.project_id === "string" ? body.project_id : "",
    engine_id: typeof body.engine_id === "string" ? body.engine_id : "",
    location: body.location === "us" || body.location === "eu" ? body.location : "global",
  };
}

export async function getGoogleAgentSearchSettings(): Promise<GoogleAgentSearchSettings> {
  const response = await fetch("/api/agent-search/settings");
  const body = await responseJson(response);
  if (!response.ok) throw new Error(String(body.detail ?? "Could not load Google Agent Search settings."));
  return toSettings(body);
}

export async function saveGoogleAgentSearchSettings(input: {
  api_key: string;
  project_id: string;
  engine_id: string;
  location: "global" | "us" | "eu";
}): Promise<GoogleAgentSearchSettings> {
  const response = await fetch("/api/agent-search/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await responseJson(response);
  if (!response.ok) throw new Error(String(body.detail ?? "Could not save Google Agent Search settings."));
  return toSettings(body);
}

export async function removeGoogleAgentSearchSettings(): Promise<GoogleAgentSearchSettings> {
  const response = await fetch("/api/agent-search/settings", { method: "DELETE" });
  const body = await responseJson(response);
  if (!response.ok) throw new Error(String(body.detail ?? "Could not remove Google Agent Search settings."));
  return toSettings(body);
}

export async function runGoogleAgentSearch(query: string): Promise<GoogleAgentSearchResult> {
  const response = await fetch("/api/agent-search/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await responseJson(response);
  if (!response.ok) throw new Error(String(body.detail ?? "Google Agent Search failed."));
  const rows = Array.isArray(body.results) ? body.results : [];
  const results = rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { title?: unknown; uri?: unknown; snippet?: unknown };
    if (typeof row.uri !== "string" || typeof row.title !== "string") return [];
    try {
      if (new URL(row.uri).protocol !== "https:") return [];
    } catch {
      return [];
    }
    return [{ title: row.title, uri: row.uri, snippet: typeof row.snippet === "string" ? row.snippet : "" }];
  });
  const parsedTotal = Number(body.total);
  return {
    provider: "google-agent-search",
    query: String(body.query ?? query),
    total: Number.isFinite(parsedTotal) ? Math.max(parsedTotal, results.length) : results.length,
    results,
  };
}

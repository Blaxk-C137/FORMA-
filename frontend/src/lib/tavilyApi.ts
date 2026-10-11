export type SearchSource = { title: string; uri: string; snippet: string };

export type TavilySearchResult = {
  provider: "tavily-keyless";
  query: string;
  total: number;
  results: SearchSource[];
};

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function runTavilySearch(query: string): Promise<TavilySearchResult> {
  const response = await fetch("/api/tavily/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await responseJson(response);
  if (!response.ok) throw new Error(String(body.detail ?? "Tavily free search failed."));
  const rows = Array.isArray(body.results) ? body.results : [];
  const results: SearchSource[] = rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { title?: unknown; uri?: unknown; snippet?: unknown };
    if (typeof row.uri !== "string" || typeof row.title !== "string") return [];
    try {
      if (new URL(row.uri).protocol !== "https:") return [];
    } catch {
      return [];
    }
    return [{
      title: row.title,
      uri: row.uri,
      snippet: typeof row.snippet === "string" ? row.snippet : "",
    }];
  });
  const parsedTotal = Number(body.total);
  return {
    provider: "tavily-keyless",
    query: String(body.query ?? query),
    total: Number.isFinite(parsedTotal) ? Math.max(parsedTotal, results.length) : results.length,
    results,
  };
}

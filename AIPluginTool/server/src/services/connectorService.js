import { getConnector } from "./connectorRegistry.js";
import { getValidAccessToken } from "./oauthService.js";

function trim(text, max = 400) {
  if (!text) return "";
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

async function authedJson(url, accessToken, signal) {
  // accessToken may already be a full "Basic ..." or "Bearer ..." value.
  const authHeader = /^(Basic|Bearer) /i.test(accessToken) ? accessToken : `Bearer ${accessToken}`;
  const response = await fetch(url, {
    headers: { Authorization: authHeader, Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Connector request failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  return response.json();
}

// --- Per-connector search implementations. Each returns [{ title, url, snippet }]
const SEARCHERS = {
  async "google-drive"(accessToken, query, signal) {
    const q = encodeURIComponent(`fullText contains '${query.replace(/'/g, "")}' and trashed = false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=5&fields=files(id,name,webViewLink,mimeType)`;
    const data = await authedJson(url, accessToken, signal);
    return (data.files ?? []).map((f) => ({
      title: f.name,
      url: f.webViewLink,
      snippet: trim(f.mimeType),
    }));
  },

  async onedrive(accessToken, query, signal) {
    const url = `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(query)}')?$top=5&$select=name,webUrl,file`;
    const data = await authedJson(url, accessToken, signal);
    return (data.value ?? []).map((f) => ({ title: f.name, url: f.webUrl, snippet: trim(f.file?.mimeType) }));
  },

  async sharepoint(accessToken, query, signal) {
    const url = `https://graph.microsoft.com/v1.0/sites?search=${encodeURIComponent(query)}&$top=5`;
    const data = await authedJson(url, accessToken, signal);
    return (data.value ?? []).map((s) => ({ title: s.displayName ?? s.name, url: s.webUrl, snippet: trim(s.description) }));
  },

  async teams(accessToken, query, signal) {
    // Graph search API across Teams chat messages.
    const response = await fetch("https://graph.microsoft.com/v1.0/search/query", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        requests: [{ entityTypes: ["chatMessage"], query: { queryString: query }, size: 5 }],
      }),
    });
    if (!response.ok) throw new Error(`Teams search failed (${response.status})`);
    const data = await response.json();
    const hits = data.value?.[0]?.hitsContainers?.[0]?.hits ?? [];
    return hits.map((h) => ({
      title: h.resource?.from?.user?.displayName ?? "Teams message",
      url: h.resource?.webUrl,
      snippet: trim(h.summary ?? h.resource?.body?.content),
    }));
  },

  async jira(accessToken, query, signal, metadata) {
    const cloudId = metadata?.cloudId;
    if (!cloudId) throw new Error("Jira site not resolved — reconnect Atlassian.");
    const jql = encodeURIComponent(`text ~ "${query.replace(/"/g, "")}" ORDER BY updated DESC`);
    const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search?jql=${jql}&maxResults=5&fields=summary,status`;
    const data = await authedJson(url, accessToken, signal);
    return (data.issues ?? []).map((issue) => ({
      title: `${issue.key}: ${issue.fields?.summary ?? ""}`,
      url: `${metadata.siteUrl}/browse/${issue.key}`,
      snippet: trim(issue.fields?.status?.name),
    }));
  },

  async confluence(accessToken, query, signal, metadata) {
    const cloudId = metadata?.cloudId;
    if (!cloudId) throw new Error("Confluence site not resolved — reconnect Atlassian.");
    const cql = encodeURIComponent(`text ~ "${query.replace(/"/g, "")}"`);
    const url = `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/rest/api/search?cql=${cql}&limit=5`;
    const data = await authedJson(url, accessToken, signal);
    return (data.results ?? []).map((r) => ({
      title: r.title ?? r.content?.title ?? "Confluence page",
      url: r.url ? `${metadata.siteUrl}/wiki${r.url}` : metadata.siteUrl,
      snippet: trim(r.excerpt),
    }));
  },
};

/** Search a single connector. Returns { connectorId, results } or throws. */
export async function searchConnector(connectorId, userEmail, query, { signal } = {}) {
  const connector = getConnector(connectorId);
  if (!connector) throw new Error(`Unknown connector: ${connectorId}`);

  const token = await getValidAccessToken(connector.provider, userEmail);
  if (!token) {
    const err = new Error(`${connector.label} is not connected.`);
    err.code = "NOT_CONNECTED";
    throw err;
  }

  const searcher = SEARCHERS[connectorId];
  const results = await searcher(token.accessToken, query, signal, token.metadata);
  return { connectorId, label: connector.label, results };
}

/** Search several connectors, swallowing individual failures. */
export async function searchConnectors(connectorIds, userEmail, query, { signal } = {}) {
  const out = [];
  for (const id of connectorIds) {
    try {
      const result = await searchConnector(id, userEmail, query, { signal });
      if (result.results.length > 0) out.push(result);
    } catch (error) {
      console.warn(`[connectors] ${id} search failed:`, error.message);
    }
  }
  return out;
}

/** Render connector hits as a context block for the system prompt. */
export function buildConnectorContext(grouped) {
  if (!grouped || grouped.length === 0) return "";
  const blocks = grouped.map((group) => {
    const lines = group.results
      .map((r, i) => `  ${i + 1}. ${r.title}${r.snippet ? ` — ${r.snippet}` : ""}${r.url ? ` (${r.url})` : ""}`)
      .join("\n");
    return `From ${group.label}:\n${lines}`;
  });
  return `Relevant results from connected apps (cite the source app when you use these):\n\n${blocks.join("\n\n")}`;
}

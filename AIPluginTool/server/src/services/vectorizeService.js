import { getVectorizeConfig } from "../config/env.js";

function vectorizeBaseUrl() {
  const { accountId, indexName } = getVectorizeConfig();
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${encodeURIComponent(indexName)}`;
}

async function vectorizeRequest(path, { method = "GET", body, contentType } = {}) {
  const config = getVectorizeConfig();
  if (!config.enabled) {
    throw new Error("Vectorize is not configured. Set VECTORIZE_INDEX_NAME in server/.env.");
  }

  const headers = {
    Authorization: `Bearer ${config.apiToken}`,
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  const response = await fetch(`${vectorizeBaseUrl()}${path}`, {
    method,
    headers,
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const message =
      payload.errors?.[0]?.message ?? `Vectorize request failed (${response.status})`;
    throw new Error(message);
  }

  return payload.result ?? payload;
}

export function isVectorizeConfigured() {
  const config = getVectorizeConfig();
  return config.enabled;
}

export async function upsertVectors(vectors) {
  if (!vectors.length) {
    return { mutationId: null, count: 0 };
  }

  const ndjson = vectors.map((vector) => JSON.stringify(vector)).join("\n");
  const result = await vectorizeRequest("/upsert", {
    method: "POST",
    contentType: "application/x-ndjson",
    body: ndjson,
  });

  return {
    mutationId: result.mutationId ?? null,
    count: vectors.length,
  };
}

export async function queryVectors(vector, { topK = 8, filter } = {}) {
  const body = {
    vector,
    topK,
    returnMetadata: "all",
    returnValues: false,
  };
  if (filter) {
    body.filter = filter;
  }

  const result = await vectorizeRequest("/query", {
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify(body),
  });

  return result.matches ?? result.vectors ?? [];
}

export async function getVectorizeIndexInfo() {
  const config = getVectorizeConfig();
  if (!config.enabled) {
    return { configured: false };
  }

  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/vectorize/v2/indexes/${encodeURIComponent(config.indexName)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.apiToken}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      return {
        configured: true,
        indexName: config.indexName,
        reachable: false,
        error: payload.errors?.[0]?.message ?? `HTTP ${response.status}`,
      };
    }
    return {
      configured: true,
      indexName: config.indexName,
      reachable: true,
      dimensions: payload.result?.config?.dimensions ?? null,
      metric: payload.result?.config?.metric ?? null,
    };
  } catch (error) {
    return {
      configured: true,
      indexName: config.indexName,
      reachable: false,
      error: error.message,
    };
  }
}

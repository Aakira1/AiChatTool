import { getEmbeddingConfig } from "../config/env.js";

export function isEmbeddingConfigured() {
  const config = getEmbeddingConfig();
  return Boolean(config.accountId && config.apiToken && config.model);
}

export async function embedTexts(texts) {
  const config = getEmbeddingConfig();
  if (!config.accountId || !config.apiToken) {
    throw new Error("Cloudflare credentials are required for embeddings.");
  }

  const batch = texts.map((text) => String(text).trim()).filter(Boolean);
  if (batch.length === 0) {
    return [];
  }

  const modelPath = encodeURIComponent(config.model);
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${modelPath}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: batch.length === 1 ? batch[0] : batch }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    const message =
      payload.errors?.[0]?.message ?? `Embedding request failed (${response.status})`;
    throw new Error(message);
  }

  let vectors = payload.result?.data ?? payload.result?.shape ?? [];
  if (!Array.isArray(vectors)) {
    throw new Error("Unexpected embedding response from Workers AI.");
  }
  if (vectors.length > 0 && typeof vectors[0] === "number") {
    vectors = [vectors];
  }
  if (vectors.length !== batch.length) {
    throw new Error("Unexpected embedding response from Workers AI.");
  }

  return vectors;
}

// Direct-from-extension AI providers (OpenAI-compatible, Anthropic, Gemini).
// The side panel / popout / embedded widget are all extension pages, so fetches
// to these hosts are NOT subject to page CORS (the extension has broad
// host_permissions) — keys stay local and calls go straight to the provider.
import { getStored, setStored } from "./storage.js";

const KEY = "aiProviders";

export const PROVIDER_TYPES = [
  {
    type: "openai",
    label: "OpenAI / compatible",
    defaultBase: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    needsBase: true,
    keyHint: "platform.openai.com → API keys (or your compatible endpoint's key). Base URL works for Azure OpenAI, OpenRouter, Groq, Ollama, LM Studio, etc.",
  },
  {
    type: "anthropic",
    label: "Anthropic (Claude)",
    defaultBase: "https://api.anthropic.com",
    defaultModel: "claude-3-5-sonnet-latest",
    needsBase: false,
    keyHint: "console.anthropic.com → API keys.",
  },
  {
    type: "gemini",
    label: "Google Gemini / AI Studio",
    defaultBase: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-1.5-flash",
    needsBase: false,
    keyHint: "aistudio.google.com/app/apikey.",
  },
];

export function providerMeta(type) {
  return PROVIDER_TYPES.find((p) => p.type === type) ?? PROVIDER_TYPES[0];
}

export const ASSISTANT_SYSTEM =
  "You are OneChat, an expert, general-purpose AI assistant. Reason carefully and be accurate; never invent facts, figures or citations, and say so if unsure. Always reply in clean Markdown. For a problem/issue/troubleshooting request use short \"##\" headings (Issue Summary, Possible Cause, Recommended Steps as a bullet list, Next Steps). For simple questions, greetings or quick how-tos, answer briefly in plain sentences — no headings, no padding.";

// ── Storage ──────────────────────────────────────────────────────────────────
// `activeIds` is an array — the chat can run several providers at once. The old
// single `activeId` is migrated transparently.
export async function getAiProviders() {
  const { [KEY]: data } = await getStored([KEY]);
  const activeIds = Array.isArray(data?.activeIds)
    ? data.activeIds
    : data?.activeId
      ? [data.activeId]
      : [];
  return { providers: Array.isArray(data?.providers) ? data.providers : [], activeIds };
}

export async function setAiProviders(data) {
  await setStored({ [KEY]: { providers: data.providers ?? [], activeIds: data.activeIds ?? [] } });
}

function isReady(p) {
  return p && p.enabled !== false && p.apiKey && p.model;
}

/** All selected, ready-to-use providers (the chat fans out to all of them). */
export async function getActiveProviders() {
  const { providers, activeIds } = await getAiProviders();
  return providers.filter((p) => activeIds.includes(p.id) && isReady(p));
}

/** The first active provider — used where a single model is needed (Notepad). */
export async function getActiveProvider() {
  return (await getActiveProviders())[0] ?? null;
}

export async function hasActiveProvider() {
  return (await getActiveProviders()).length > 0;
}

// ── Streaming dispatch ───────────────────────────────────────────────────────
// `messages`: [{ role: 'system'|'user'|'assistant', content }]. Streams text
// chunks via onToken and resolves with the full reply.
export async function streamLlm({ provider, messages, signal, onToken, maxTokens = 4096 }) {
  if (provider.type === "anthropic") return streamAnthropic(provider, messages, { signal, onToken, maxTokens });
  if (provider.type === "gemini") return streamGemini(provider, messages, { signal, onToken, maxTokens });
  return streamOpenAI(provider, messages, { signal, onToken, maxTokens });
}

async function errText(res, provider) {
  let msg = "";
  try {
    const j = await res.json();
    msg = j.error?.message || j.error?.type || j.message || JSON.stringify(j).slice(0, 200);
  } catch {
    msg = await res.text().catch(() => "");
  }
  return `${providerMeta(provider.type).label} error (${res.status}): ${msg || "request failed"}`;
}

// Parse an SSE stream, calling onEvent(parsedJson) for each `data:` payload.
async function readSse(res, onEvent) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith("data:")) continue;
      const data = l.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try { onEvent(JSON.parse(data)); } catch { /* skip partial/non-JSON */ }
    }
  }
}

async function streamOpenAI(p, messages, { signal, onToken, maxTokens }) {
  const base = (p.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.apiKey}` },
    body: JSON.stringify({
      model: p.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok || !res.body) throw new Error(await errText(res, p));
  let full = "";
  await readSse(res, (j) => {
    const t = j.choices?.[0]?.delta?.content;
    if (t) { full += t; onToken?.(t); }
  });
  return full;
}

async function streamAnthropic(p, messages, { signal, onToken, maxTokens }) {
  const base = (p.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  // Anthropic needs alternating user/assistant starting with user.
  const msgs = messages
    .filter((m) => m.role !== "system" && m.content)
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": p.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: p.model, max_tokens: maxTokens, ...(system ? { system } : {}), messages: msgs, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(await errText(res, p));
  let full = "";
  await readSse(res, (j) => {
    if (j.type === "content_block_delta" && j.delta?.type === "text_delta") {
      full += j.delta.text;
      onToken?.(j.delta.text);
    }
  });
  return full;
}

async function streamGemini(p, messages, { signal, onToken, maxTokens }) {
  const base = (p.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system" && m.content)
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content) }] }));
  const url = `${base}/models/${encodeURIComponent(p.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(p.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });
  if (!res.ok || !res.body) throw new Error(await errText(res, p));
  let full = "";
  await readSse(res, (j) => {
    const t = (j.candidates?.[0]?.content?.parts ?? []).map((x) => x.text || "").join("");
    if (t) { full += t; onToken?.(t); }
  });
  return full;
}

import { getApiBaseUrl, getWorkerAuthToken } from "./storage.js";

export class SessionExpiredError extends Error {
  constructor() {
    super("SESSION_EXPIRED");
    this.name = "SessionExpiredError";
  }
}

async function apiFetch(path, options = {}) {
  const base = await getApiBaseUrl();
  const token = await getWorkerAuthToken();
  const response = await fetch(`${base}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (response.status === 401 && !path.startsWith("/api/auth/")) {
    throw new SessionExpiredError();
  }

  return response;
}

function loginErrorMessage(status, payloadError) {
  if (payloadError) return payloadError;
  if (status === 401) return "Invalid email or password";
  if (status === 404) {
    return "API not found. Check your API URL in the extension options.";
  }
  return `Login failed (${status})`;
}

export async function getAuthMe() {
  try {
    const response = await apiFetch("/api/auth/me");
    if (!response.ok) {
      return { authenticated: false };
    }
    return response.json();
  } catch {
    return { authenticated: false, offline: true };
  }
}

export async function login(email, password) {
  const response = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(loginErrorMessage(response.status, payload.error));
  }
  return response.json();
}

export async function register({ email, password, displayName }) {
  const response = await apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? `Registration failed (${response.status})`);
  }
  return response.json();
}

export async function logout() {
  await apiFetch("/api/auth/logout", { method: "POST" });
}

export async function updateDisplayName(displayName) {
  const response = await apiFetch("/api/auth/display-name", {
    method: "PATCH",
    body: JSON.stringify({ displayName }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "Failed to update display name");
  }
  return response.json();
}

export async function changePassword({ currentPassword, newPassword }) {
  const response = await apiFetch("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "Failed to change password");
  }
  return response.json();
}

export async function listConversations({ archived = false } = {}) {
  const query = archived ? "?archived=only" : "";
  const response = await apiFetch(`/api/conversations${query}`);
  if (!response.ok) {
    throw new Error("Failed to load conversations");
  }
  return response.json();
}

export async function createConversation(title = "New chat") {
  const response = await apiFetch("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    throw new Error("Failed to create conversation");
  }
  return response.json();
}

export async function getConversation(conversationId) {
  const response = await apiFetch(`/api/conversations/${conversationId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch conversation");
  }
  return response.json();
}

export async function deleteConversation(conversationId) {
  const response = await apiFetch(`/api/conversations/${conversationId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete conversation");
  }
}

export async function updateConversation(conversationId, updates) {
  const response = await apiFetch(`/api/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    throw new Error("Failed to update conversation");
  }
  return response.json();
}

// ---- Forums -------------------------------------------------------------

export async function listForums() {
  const response = await apiFetch("/api/forums");
  if (!response.ok) {
    throw new Error("Failed to load forums");
  }
  return response.json();
}

export async function createForum({ name, description = "" }) {
  const response = await apiFetch("/api/forums", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
  if (!response.ok) {
    throw new Error("Failed to create forum");
  }
  return response.json();
}

export async function deleteForum(id) {
  const response = await apiFetch(`/api/forums/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error("Failed to delete forum");
  }
}

export async function listForumPosts(forumId) {
  const response = await apiFetch(`/api/forums/${forumId}/posts`);
  if (!response.ok) {
    throw new Error("Failed to load posts");
  }
  return response.json();
}

export async function createForumPost({ forumId, title, body = "" }) {
  const response = await apiFetch(`/api/forums/${forumId}/posts`, {
    method: "POST",
    body: JSON.stringify({ title, body }),
  });
  if (!response.ok) {
    throw new Error("Failed to create post");
  }
  return response.json();
}

export async function deleteForumPost(postId) {
  const response = await apiFetch(`/api/forums/posts/${postId}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error("Failed to delete post");
  }
}

export async function listForumComments(postId) {
  const response = await apiFetch(`/api/forums/posts/${postId}/comments`);
  if (!response.ok) {
    throw new Error("Failed to load comments");
  }
  return response.json();
}

export async function createForumComment({ postId, body }) {
  const response = await apiFetch(`/api/forums/posts/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  if (!response.ok) {
    throw new Error("Failed to add comment");
  }
  return response.json();
}

export async function voteForumPost({ postId, value }) {
  const response = await apiFetch(`/api/forums/posts/${postId}/vote`, {
    method: "POST",
    body: JSON.stringify({ value }),
  });
  if (!response.ok) {
    throw new Error("Failed to vote");
  }
  return response.json();
}

async function consumeChatStream(response, callbacks) {
  const { onToken, onComplete, onInsights, onArtifacts } = callbacks;

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}));
    const detailText =
      payload.details && typeof payload.details === "object"
        ? Object.entries(payload.details)
            .map(([field, messages]) => `${field}: ${(messages ?? []).join(", ")}`)
            .join("; ")
        : "";
    throw new Error(
      [payload.error, detailText].filter(Boolean).join(" — ") ||
        `Chat request failed (${response.status}). Check the server logs and your API URL.`,
    );
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let assistantMessageId = null;
  let insights = null;
  let artifacts = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const line = chunk
        .split("\n")
        .find((entry) => entry.startsWith("data: "));
      if (!line) {
        continue;
      }

      const payload = line.slice(6);
      if (payload === "[DONE]") {
        onComplete?.({ assistantMessageId, insights, artifacts });
        return;
      }

      const parsed = JSON.parse(payload);
      if (parsed.type === "token") {
        onToken?.(parsed.token);
      } else if (parsed.type === "error") {
        throw new Error(parsed.message ?? "Streaming request failed");
      } else if (parsed.type === "done") {
        assistantMessageId = parsed.assistantMessageId ?? null;
        insights = parsed.insights ?? null;
        artifacts = parsed.artifacts ?? null;
        onInsights?.(insights);
        onArtifacts?.(artifacts);
        onComplete?.({ assistantMessageId, insights, artifacts });
      }
    }
  }
}

export async function streamChat({
  conversationId,
  history,
  message,
  attachments = [],
  pageContext,
  provider,
  reasoning,
  sources,
  connectorSources = [],
  signal,
  onToken,
  onComplete,
  onInsights,
  onArtifacts,
}) {
  const base = await getApiBaseUrl();
  const token = await getWorkerAuthToken();
  const response = await fetch(`${base}/api/chat`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      conversationId,
      ...(history ? { history } : {}),
      message,
      attachments,
      ...(pageContext != null ? { pageContext } : {}),
      ...(provider && provider !== "server" ? { provider } : {}),
      ...(reasoning && reasoning !== "auto" ? { reasoning } : {}),
      ...(sources ? { sources } : {}),
      ...(connectorSources.length > 0 ? { connectorSources } : {}),
    }),
    signal,
  });
  if (response.status === 401) {
    throw new SessionExpiredError();
  }
  await consumeChatStream(response, {
    signal,
    onToken,
    onComplete,
    onInsights,
    onArtifacts,
  });
}

export async function regenerateChat({
  conversationId,
  provider,
  reasoning,
  signal,
  onToken,
  onComplete,
  onInsights,
  onArtifacts,
}) {
  const base = await getApiBaseUrl();
  const response = await fetch(`${base}/api/chat/regenerate`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId,
      ...(provider && provider !== "server" ? { provider } : {}),
      ...(reasoning && reasoning !== "auto" ? { reasoning } : {}),
    }),
    signal,
  });
  if (response.status === 401) {
    throw new SessionExpiredError();
  }
  await consumeChatStream(response, { signal, onToken, onComplete, onInsights, onArtifacts });
}

export async function rateMessage(messageId, rating) {
  const response = await apiFetch(`/api/messages/${messageId}/feedback`, {
    method: "PATCH",
    body: JSON.stringify({ rating }),
  });
  if (!response.ok) {
    throw new Error("Failed to save feedback");
  }
  return response.json().catch(() => ({}));
}

// Agentic relay controller: decide the next step of a conversation with an
// on-page AI (e.g. Rovo). Returns { action:"ask", message } | { action:"done", final }.
// (relayConclude is defined below near getCompanion)
export async function relayPlanStep({ goal, transcript = [], turn = 1, maxTurns = 4, partnerName }) {
  const response = await apiFetch("/api/relay/step", {
    method: "POST",
    body: JSON.stringify({ goal, transcript, turn, maxTurns, partnerName }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "Relay planning failed");
  }
  return response.json();
}

// Send a screenshot (data URL or base64) to the vision model and get a text
// description back — used to "read" an on-page AI reply when DOM text fails.
export async function describeImageRemote({ dataUrl, prompt, name }) {
  const imageBase64 = dataUrl?.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  if (!imageBase64) return "";
  try {
    const response = await apiFetch("/api/vision/describe", {
      method: "POST",
      body: JSON.stringify({ imageBase64, prompt, name }),
    });
    if (!response.ok) return "";
    const data = await response.json();
    return data.text || "";
  } catch {
    return "";
  }
}

// Final pass: synthesise the user-facing conclusion from the whole exchange.
export async function relayConclude({ goal, transcript = [], partnerName }) {
  const response = await apiFetch("/api/relay/conclude", {
    method: "POST",
    body: JSON.stringify({ goal, transcript, partnerName }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "Conclusion failed");
  }
  const data = await response.json();
  return data.final || "";
}

export async function getCompanion() {
  const response = await apiFetch("/api/companion");
  if (!response.ok) return null;
  return response.json();
}

function fileToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export async function parseXlsxFile(file) {
  const dataBase64 = fileToBase64(await file.arrayBuffer());
  const response = await apiFetch("/api/companion/parse-xlsx", {
    method: "POST",
    body: JSON.stringify({ dataBase64 }),
  });
  if (!response.ok) throw new Error("Couldn't read the spreadsheet");
  const { rows } = await response.json();
  return rows;
}

// Parse a whole workbook into stage sheets (multi-sheet config companions).
export async function parseXlsxWorkbook(file) {
  const dataBase64 = fileToBase64(await file.arrayBuffer());
  const response = await apiFetch("/api/companion/parse-xlsx", {
    method: "POST",
    body: JSON.stringify({ dataBase64 }),
  });
  if (!response.ok) throw new Error("Couldn't read the spreadsheet");
  const data = await response.json();
  const sheets = data.sheets ?? (data.rows ? [{ name: "Sheet1", rows: data.rows }] : []);
  return { sheets, dataBase64 };
}

export async function saveCompanion({ fileName, rows, sheets, baseUpdatedAt }) {
  const response = await apiFetch("/api/companion", {
    method: "PUT",
    body: JSON.stringify({ fileName, rows, sheets, baseUpdatedAt }),
  });
  if (response.status === 409) return { conflict: true, ...(await response.json()) };
  if (!response.ok) throw new Error("Couldn't save the checklist");
  return response.json();
}

export async function listConnectors() {
  const response = await apiFetch("/api/connectors");
  if (!response.ok) {
    throw new Error("Failed to load connectors");
  }
  return response.json();
}

export async function getConnectorConnectUrl(connectorId) {
  const base = await getApiBaseUrl();
  return `${base}/api/connectors/${connectorId}/connect`;
}

export async function disconnectConnector(provider) {
  const response = await apiFetch(`/api/connectors/${provider}/disconnect`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Failed to disconnect");
  }
  return response.json();
}

export async function listConnectorProviders() {
  const response = await apiFetch("/api/connectors/providers");
  if (!response.ok) {
    throw new Error("Failed to load connector providers");
  }
  return response.json();
}

export async function saveConnectorProvider(provider, config) {
  const response = await apiFetch(`/api/connectors/providers/${provider}`, {
    method: "PUT",
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "Failed to save credentials");
  }
  return response.json();
}

export async function testConnectorProvider(provider) {
  const response = await apiFetch(`/api/connectors/providers/${provider}/test`, { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "Test request failed");
  return payload;
}

export async function clearConnectorProvider(provider) {
  const response = await apiFetch(`/api/connectors/providers/${provider}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to clear credentials");
  }
  return response.json();
}

export async function pingHealth() {
  try {
    const base = await getApiBaseUrl();
    const response = await fetch(`${base}/health`, { credentials: "include" });
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, ...(await response.json()) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// ---- Downloadable spreadsheets ------------------------------------------

const fileStem = (title) =>
  (title || "export").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "export";

async function downloadBlob(response, title, ext = "xlsx") {
  if (!response.ok) {
    let message = "Couldn't build the file";
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileStem(title)}.${ext}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Build + download an .xlsx from free-form content (server parses markdown tables).
export async function exportToExcel({ content, title = "AI Export" }) {
  const response = await apiFetch("/api/export/xlsx", {
    method: "POST",
    body: JSON.stringify({ content, title }),
  });
  await downloadBlob(response, title);
}

// Build + download an .xlsx deterministically from a model-provided workbook spec.
export async function downloadXlsxSpec({ title = "Export", sheets }) {
  const response = await apiFetch("/api/export/xlsx-spec", {
    method: "POST",
    body: JSON.stringify({ title, sheets }),
  });
  await downloadBlob(response, title, "xlsx");
}

// Build + download a Word (.docx) document from markdown content.
export async function downloadDocx({ content, title = "Document" }) {
  const response = await apiFetch("/api/export/docx", {
    method: "POST",
    body: JSON.stringify({ content, title }),
  });
  await downloadBlob(response, title, "docx");
}

// Build + download a PDF document from markdown content.
export async function downloadPdf({ content, title = "Document" }) {
  const response = await apiFetch("/api/export/pdf", {
    method: "POST",
    body: JSON.stringify({ content, title }),
  });
  await downloadBlob(response, title, "pdf");
}

// Build + download a PowerPoint (.pptx) deck from markdown content.
export async function downloadPptx({ content, title = "Presentation" }) {
  const response = await apiFetch("/api/export/pptx", {
    method: "POST",
    body: JSON.stringify({ content, title }),
  });
  await downloadBlob(response, title, "pptx");
}

// Build + download a CSV file from content (extracts tabular data).
export async function downloadCsv({ content, title = "Data" }) {
  const response = await apiFetch("/api/export/csv", {
    method: "POST",
    body: JSON.stringify({ content, title }),
  });
  await downloadBlob(response, title, "csv");
}

// Build + download a fillable PDF form from content.
export async function downloadForm({ content, title = "Form" }) {
  const response = await apiFetch("/api/export/form", {
    method: "POST",
    body: JSON.stringify({ content, title }),
  });
  await downloadBlob(response, title, "pdf");
}

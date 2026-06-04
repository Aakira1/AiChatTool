import { getChatAiProvider } from "./settings.js";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

function loginErrorMessage(status, payloadError) {
  if (payloadError) {
    return payloadError;
  }
  if (status === 401) {
    return "Invalid email or password";
  }
  if (status === 404) {
    return "API not found. Run npm run dev from the project root (starts server + client).";
  }
  return `Login failed (${status})`;
}

/** Thrown when the server rejects a request because the session is no longer valid. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Your session expired. Please sign in again.");
    this.name = "SessionExpiredError";
    this.code = "SESSION_EXPIRED";
  }
}

/**
 * Build a clear, human-readable error from a failed response. Prefers the
 * server's own message, then Zod field errors, then a status-specific fallback,
 * so toasts say what actually went wrong instead of a generic "Failed to…".
 */
async function readError(response, fallback) {
  let serverMessage = "";
  try {
    const payload = await response.json();
    serverMessage = payload?.error || payload?.message || "";
    if (!serverMessage && payload?.details && typeof payload.details === "object") {
      const firstField = Object.values(payload.details).flat().find(Boolean);
      if (firstField) serverMessage = String(firstField);
    }
  } catch {
    // Response body was empty or not JSON — fall back to status-based wording.
  }
  if (serverMessage) return serverMessage;
  if (response.status === 404) return `${fallback} — not found.`;
  if (response.status === 403) return `${fallback} — you don't have permission to do that.`;
  if (response.status === 429) return "Too many requests — please wait a moment and try again.";
  if (response.status >= 500) {
    return `${fallback} — the server had a problem (error ${response.status}). Check the server logs.`;
  }
  return `${fallback} (error ${response.status}).`;
}

async function apiFetch(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
  } catch {
    // Network-level failure (server down, offline, CORS) — fetch rejects with a
    // vague "Failed to fetch", so give the user something actionable instead.
    throw new Error(
      "Can't reach the server. Make sure it's running and/or check your connection.",
    );
  }

  if (response.status === 401 && !path.startsWith("/api/auth/")) {
    throw new SessionExpiredError();
  }

  return response;
}

export async function getAuthMe() {
  const response = await apiFetch("/api/auth/me");
  if (!response.ok) {
    return { authenticated: false };
  }
  return response.json();
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

export async function listConversations({ archived = false } = {}) {
  const query = archived ? "?archived=only" : "";
  const response = await apiFetch(`/api/conversations${query}`);
  if (!response.ok) {
    throw new Error("Failed to load conversations");
  }
  return response.json();
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

export async function getTerminology() {
  const response = await apiFetch("/api/terminology");
  if (!response.ok) {
    throw new Error("Failed to load terminology");
  }
  return response.json();
}

export async function addTerminology({ ciTerm, ciaTerm, notes = [] }) {
  const response = await apiFetch("/api/terminology", {
    method: "POST",
    body: JSON.stringify({ ciTerm, ciaTerm, notes }),
  });
  if (!response.ok) {
    throw new Error("Failed to add term");
  }
  return response.json();
}

export async function deleteTerminology(id) {
  const response = await apiFetch(`/api/terminology/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error("Failed to delete term");
  }
  return response.json();
}

// ---- Forums -------------------------------------------------------------

export async function listForums() {
  const response = await apiFetch("/api/forums");
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't load forums"));
  }
  return response.json();
}

export async function createForum({ name, description = "" }) {
  const response = await apiFetch("/api/forums", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't create the forum"));
  }
  return response.json();
}

export async function deleteForum(id) {
  const response = await apiFetch(`/api/forums/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't delete the forum"));
  }
}

export async function listPosts(forumId) {
  const response = await apiFetch(`/api/forums/${forumId}/posts`);
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't load posts"));
  }
  return response.json();
}

export async function createPost({ forumId, title, body = "" }) {
  const response = await apiFetch(`/api/forums/${forumId}/posts`, {
    method: "POST",
    body: JSON.stringify({ title, body }),
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't create the post"));
  }
  return response.json();
}

export async function deletePost(postId) {
  const response = await apiFetch(`/api/forums/posts/${postId}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't delete the post"));
  }
}

export async function listComments(postId) {
  const response = await apiFetch(`/api/forums/posts/${postId}/comments`);
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't load comments"));
  }
  return response.json();
}

export async function createComment({ postId, body }) {
  const response = await apiFetch(`/api/forums/posts/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't add your comment"));
  }
  return response.json();
}

export async function deleteComment(commentId) {
  const response = await apiFetch(`/api/forums/comments/${commentId}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't delete the comment"));
  }
}

export async function acceptAnswer(postId, commentId) {
  const response = await apiFetch(`/api/forums/posts/${postId}/accept`, {
    method: "POST",
    body: JSON.stringify({ commentId }),
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't update the accepted answer"));
  }
  return response.json();
}

export async function votePost({ postId, value }) {
  const response = await apiFetch(`/api/forums/posts/${postId}/vote`, {
    method: "POST",
    body: JSON.stringify({ value }),
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't record your vote"));
  }
  return response.json();
}

export async function searchForumPosts(query) {
  const response = await apiFetch(`/api/forums/search/posts?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't search posts"));
  }
  return response.json();
}

export async function summarizePost(postId) {
  const response = await apiFetch(`/api/forums/posts/${postId}/summarize`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't summarize this thread"));
  }
  return response.json();
}

// ---- Notifications ------------------------------------------------------

export async function listNotifications() {
  const response = await apiFetch("/api/notifications");
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't load notifications"));
  }
  return response.json();
}

export async function getUnreadCount() {
  const response = await apiFetch("/api/notifications/unread-count");
  if (!response.ok) {
    return { unread: 0 };
  }
  return response.json();
}

export async function markAllNotificationsRead() {
  const response = await apiFetch("/api/notifications/read-all", { method: "POST" });
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't mark notifications as read"));
  }
  return response.json();
}

export async function markNotificationRead(id) {
  const response = await apiFetch(`/api/notifications/${id}/read`, { method: "POST" });
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't update the notification"));
  }
  return response.json();
}

export async function clearAllNotifications() {
  const response = await apiFetch("/api/notifications", { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't clear notifications"));
  }
  return response.json();
}

// ---- Export -------------------------------------------------------------

/** Build an .xlsx from content and trigger a browser download. */
export async function exportToExcel({ content, title = "AI Export" }) {
  const response = await apiFetch("/api/export/xlsx", {
    method: "POST",
    body: JSON.stringify({ content, title }),
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't build the spreadsheet"));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const stem = (title || "export").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "export";
  link.download = `${stem}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Build + download an .xlsx from a model-provided workbook spec (no LLM call).
export async function downloadXlsxSpec({ title = "Export", sheets }) {
  const response = await apiFetch("/api/export/xlsx-spec", {
    method: "POST",
    body: JSON.stringify({ title, sheets }),
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't build the spreadsheet"));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const stem = (title || "export").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "export";
  link.download = `${stem}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---- Admin --------------------------------------------------------------

export async function listAdminUsers() {
  const response = await apiFetch("/api/admin/users");
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't load users"));
  }
  return response.json();
}

export async function setUserRole(email, role) {
  const response = await apiFetch(`/api/admin/users/${encodeURIComponent(email)}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't update the user's role"));
  }
  return response.json();
}

export async function listAdminContent() {
  const response = await apiFetch("/api/admin/content");
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't load forum content"));
  }
  return response.json();
}

export async function listAuditLog(limit = 100) {
  const response = await apiFetch(`/api/admin/audit?limit=${limit}`);
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't load the audit log"));
  }
  return response.json();
}

// ---- Account ------------------------------------------------------------

export async function updateDisplayName(displayName) {
  const response = await apiFetch("/api/auth/display-name", {
    method: "PATCH",
    body: JSON.stringify({ displayName }),
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't update your display name"));
  }
  return response.json();
}

export async function changePassword({ currentPassword, newPassword }) {
  const response = await apiFetch("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Couldn't change your password"));
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

export async function rateMessage(messageId, rating) {
  const response = await apiFetch(`/api/messages/${messageId}/feedback`, {
    method: "PATCH",
    body: JSON.stringify({ rating }),
  });

  if (!response.ok) {
    throw new Error("Failed to save feedback");
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

export async function getAnalyticsSummary() {
  const response = await apiFetch("/api/analytics/summary");
  if (!response.ok) {
    throw new Error("Failed to load analytics summary");
  }
  return response.json();
}

export async function getAnalyticsInsights(query) {
  const response = await apiFetch(`/api/analytics/insights?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw new Error("Failed to load analytics insights");
  }
  return response.json();
}

export async function getProfile() {
  const response = await apiFetch("/api/profile");
  if (!response.ok) {
    throw new Error("Failed to load profile");
  }
  return response.json();
}

export async function updateProfile(updates) {
  const response = await apiFetch("/api/profile", {
    method: "PUT",
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    throw new Error("Failed to update profile");
  }
  return response.json();
}

export async function getKnowledgeStatus() {
  const response = await apiFetch("/api/knowledge/status");
  if (!response.ok) {
    throw new Error("Failed to load knowledge status");
  }
  return response.json();
}

export async function rebuildKnowledgeIndex({ importSamples = true } = {}) {
  const response = await apiFetch("/api/knowledge/rebuild", {
    method: "POST",
    body: JSON.stringify({ importSamples }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "Failed to rebuild knowledge index");
  }
  return response.json();
}

export async function importCases(source, rows) {
  const response = await apiFetch(`/api/import/${source}`, {
    method: "POST",
    body: JSON.stringify({ rows }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? `Failed to import ${source.toUpperCase()} cases`);
  }
  return response.json();
}

export async function listConnectors() {
  const response = await apiFetch("/api/connectors");
  if (!response.ok) {
    throw new Error("Failed to load connectors");
  }
  return response.json();
}

export function connectConnectorUrl(connectorId, returnTo = window.location.href) {
  const query = `?returnTo=${encodeURIComponent(returnTo)}`;
  return `${API_BASE_URL}/api/connectors/${connectorId}/connect${query}`;
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

export async function clearConnectorProvider(provider) {
  const response = await apiFetch(`/api/connectors/providers/${provider}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to clear credentials");
  }
  return response.json();
}

async function consumeChatStream(response, callbacks) {
  const { signal, onToken, onComplete, onInsights, onArtifacts } = callbacks;

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      payload.error ??
        `Chat request failed (${response.status}). Check server logs and Cloudflare API keys.`,
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
  message,
  attachments = [],
  pageContext,
  connectorSources = [],
  aiProvider,
  reasoning,
  signal,
  onToken,
  onComplete,
  onInsights,
  onArtifacts,
}) {
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId,
      message,
      pageContext,
      attachments,
      ...(connectorSources.length > 0 ? { connectorSources } : {}),
      ...(reasoning ? { reasoning } : {}),
      ...(aiProvider ? { aiProvider } : getChatAiProvider()),
    }),
    signal,
  });
  if (response.status === 401) {
    throw new SessionExpiredError();
  }
  await consumeChatStream(response, { signal, onToken, onComplete, onInsights, onArtifacts });
}

export async function regenerateChat({ conversationId, signal, ...callbacks }) {
  const response = await fetch(`${API_BASE_URL}/api/chat/regenerate`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, ...getChatAiProvider() }),
    signal,
  });
  if (response.status === 401) {
    throw new SessionExpiredError();
  }
  await consumeChatStream(response, { signal, ...callbacks });
}

export async function editChatMessage({ conversationId, messageId, content, signal, ...callbacks }) {
  const response = await fetch(`${API_BASE_URL}/api/chat/edit`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, messageId, content, ...getChatAiProvider() }),
    signal,
  });
  if (response.status === 401) {
    throw new SessionExpiredError();
  }
  await consumeChatStream(response, { signal, ...callbacks });
}

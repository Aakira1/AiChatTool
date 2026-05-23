import { getApiBaseUrl } from "./storage.js";

export class SessionExpiredError extends Error {
  constructor() {
    super("SESSION_EXPIRED");
    this.name = "SessionExpiredError";
  }
}

async function apiFetch(path, options = {}) {
  const base = await getApiBaseUrl();
  const response = await fetch(`${base}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
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

async function consumeChatStream(response, callbacks) {
  const { onToken, onComplete, onInsights, onArtifacts } = callbacks;

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      payload.error ??
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
  message,
  attachments = [],
  pageContext,
  signal,
  onToken,
  onComplete,
  onInsights,
  onArtifacts,
}) {
  const base = await getApiBaseUrl();
  const response = await fetch(`${base}/api/chat`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, message, pageContext, attachments }),
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

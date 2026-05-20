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

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (response.status === 401 && !path.startsWith("/api/auth/")) {
    throw new Error("SESSION_EXPIRED");
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
    body: JSON.stringify({ conversationId, message, pageContext, attachments }),
    signal,
  });
  if (response.status === 401) {
    throw new Error("SESSION_EXPIRED");
  }
  await consumeChatStream(response, { signal, onToken, onComplete, onInsights, onArtifacts });
}

export async function regenerateChat({ conversationId, signal, ...callbacks }) {
  const response = await fetch(`${API_BASE_URL}/api/chat/regenerate`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId }),
    signal,
  });
  if (response.status === 401) {
    throw new Error("SESSION_EXPIRED");
  }
  await consumeChatStream(response, { signal, ...callbacks });
}

export async function editChatMessage({ conversationId, messageId, content, signal, ...callbacks }) {
  const response = await fetch(`${API_BASE_URL}/api/chat/edit`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, messageId, content }),
    signal,
  });
  if (response.status === 401) {
    throw new Error("SESSION_EXPIRED");
  }
  await consumeChatStream(response, { signal, ...callbacks });
}

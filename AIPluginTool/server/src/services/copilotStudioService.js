import { env } from "../config/env.js";

const DIRECT_LINE_API = "https://directline.botframework.com/v3/directline";

export function isCopilotStudioConfigured() {
  return Boolean(env.copilotStudioEnabled && env.copilotStudioDirectLineSecret);
}

async function directLineFetch(path, { method = "GET", body, signal } = {}) {
  const response = await fetch(`${DIRECT_LINE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.copilotStudioDirectLineSecret}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      detail
        ? `Copilot Studio Direct Line error (${response.status}): ${detail.slice(0, 280)}`
        : `Copilot Studio Direct Line error (${response.status})`,
    );
  }

  return response.json();
}

async function startConversation(signal) {
  const payload = await directLineFetch("/conversations", { method: "POST", signal });
  return payload.conversationId;
}

async function postActivity(conversationId, text, signal) {
  await directLineFetch(`/conversations/${conversationId}/activities`, {
    method: "POST",
    signal,
    body: {
      type: "message",
      from: { id: "cia-user" },
      text,
    },
  });
}

async function waitForBotReply(conversationId, signal, { timeoutMs = 60_000 } = {}) {
  const started = Date.now();
  let watermark = null;

  while (Date.now() - started < timeoutMs) {
    const path = watermark
      ? `/conversations/${conversationId}/activities?watermark=${encodeURIComponent(watermark)}`
      : `/conversations/${conversationId}/activities`;

    const payload = await directLineFetch(path, { signal });
    const activities = payload.activities ?? [];
    watermark = payload.watermark ?? watermark;

    const botMessages = activities.filter(
      (activity) =>
        activity.type === "message" &&
        activity.from?.id !== "cia-user" &&
        typeof activity.text === "string" &&
        activity.text.trim(),
    );

    if (botMessages.length > 0) {
      return botMessages.map((activity) => activity.text.trim()).join("\n\n");
    }

    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  throw new Error("Timed out waiting for Copilot Studio agent reply.");
}

/**
 * Send one user turn to a Copilot Studio bot via Direct Line and return the reply text.
 */
export async function askCopilotStudioAgent(userText, { signal } = {}) {
  if (!isCopilotStudioConfigured()) {
    throw new Error(
      "Copilot Studio is not configured on the server. Set COPILOT_STUDIO_ENABLED=true and COPILOT_STUDIO_DIRECT_LINE_SECRET in server/.env (from Copilot Studio → Channels → Direct Line).",
    );
  }

  const conversationId = await startConversation(signal);
  await postActivity(conversationId, userText, signal);
  return waitForBotReply(conversationId, signal);
}

/** Yield reply in chunks for SSE streaming. */
export async function* streamCopilotStudioAgent(userText, { signal } = {}) {
  const reply = await askCopilotStudioAgent(userText, { signal });
  for (const token of reply.split(/(\s+)/)) {
    if (token) {
      yield token;
    }
  }
}

import { env } from "../config/env.js";

const DIRECT_LINE_API = "https://directline.botframework.com/v3/directline";

/**
 * Copilot Studio is usable when either the server has a configured Direct Line
 * secret OR the request supplied one (a user-managed agent from the client).
 */
export function isCopilotStudioConfigured(requestSecret) {
  return Boolean(requestSecret || (env.copilotStudioEnabled && env.copilotStudioDirectLineSecret));
}

function resolveSecret(requestSecret) {
  return requestSecret || env.copilotStudioDirectLineSecret;
}

async function directLineFetch(path, { method = "GET", body, signal, secret } = {}) {
  const response = await fetch(`${DIRECT_LINE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${resolveSecret(secret)}`,
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

async function startConversation(signal, secret) {
  const payload = await directLineFetch("/conversations", { method: "POST", signal, secret });
  return payload.conversationId;
}

async function postActivity(conversationId, text, signal, secret) {
  await directLineFetch(`/conversations/${conversationId}/activities`, {
    method: "POST",
    signal,
    secret,
    body: {
      type: "message",
      from: { id: "cia-user" },
      text,
    },
  });
}

async function waitForBotReply(conversationId, signal, { timeoutMs = 60_000, secret } = {}) {
  const started = Date.now();
  let watermark = null;

  while (Date.now() - started < timeoutMs) {
    const path = watermark
      ? `/conversations/${conversationId}/activities?watermark=${encodeURIComponent(watermark)}`
      : `/conversations/${conversationId}/activities`;

    const payload = await directLineFetch(path, { signal, secret });
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
export async function askCopilotStudioAgent(userText, { signal, secret } = {}) {
  if (!isCopilotStudioConfigured(secret)) {
    throw new Error(
      "Copilot Studio is not configured. Add an agent with a Direct Line secret in Settings, " +
        "or set COPILOT_STUDIO_ENABLED=true and COPILOT_STUDIO_DIRECT_LINE_SECRET in server/.env.",
    );
  }

  const conversationId = await startConversation(signal, secret);
  await postActivity(conversationId, userText, signal, secret);
  return waitForBotReply(conversationId, signal, { secret });
}

/**
 * Ask every configured agent in parallel and return the successful, non-empty
 * replies as { name, reply }. Failures and empty answers are dropped.
 */
export async function askAllCopilotAgents(userText, agents, { signal } = {}) {
  const settled = await Promise.allSettled(
    agents.map((agent) =>
      askCopilotStudioAgent(userText, { signal, secret: agent.directLineSecret }).then((reply) => ({
        name: agent.name || "Copilot agent",
        reply,
      })),
    ),
  );
  return settled
    .filter((r) => r.status === "fulfilled" && r.value.reply?.trim())
    .map((r) => r.value);
}

/** Yield reply in chunks for SSE streaming. */
export async function* streamCopilotStudioAgent(userText, { signal, secret } = {}) {
  const reply = await askCopilotStudioAgent(userText, { signal, secret });
  for (const token of reply.split(/(\s+)/)) {
    if (token) {
      yield token;
    }
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Allow overriding the model without redeploying via `wrangler secret put MODEL`
// (or a [vars] entry in wrangler.toml).
function modelFor(env) {
  return env.MODEL || DEFAULT_MODEL;
}

const SYSTEM_PROMPT = `You are OneChat, an AI assistant built for TechnologyOne consultants.
You help with project management, CiA platform questions, client work, and general queries.
Be concise, professional, and practical. When you reference information from connected apps, cite the source.`;

function cors(body = null, init = {}) {
  return new Response(body, { ...init, headers: { ...CORS, ...(init.headers ?? {}) } });
}

function json(data, init = {}) {
  return cors(JSON.stringify(data), { ...init, headers: { "Content-Type": "application/json", ...CORS } });
}

function authorized(request, env) {
  if (!env.AUTH_TOKEN) return true;
  const auth = request.headers.get("Authorization") ?? "";
  return auth === `Bearer ${env.AUTH_TOKEN}`;
}

function uuid() {
  return `cf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// --- /api/chat ---------------------------------------------------------------

async function handleChat(request, env) {
  const body = await request.json();
  const { conversationId, message = "", history = [], attachments = [], pageContext } = body;

  // Build full message array for the model
  const prior = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.id !== "welcome" && m.content)
    .map((m) => ({ role: m.role, content: String(m.content) }));

  let userContent = message;
  if (pageContext?.text) {
    userContent += `\n\n[Page context — ${pageContext.title ?? pageContext.url ?? "current tab"}]\n${pageContext.text.slice(0, 4000)}`;
  }
  if (attachments?.length > 0) {
    const names = attachments.map((a) => a.name).join(", ");
    userContent += `\n\n[Attachments: ${names}]`;
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...prior,
    { role: "user", content: userContent || "(no message)" },
  ];

  // With stream:true, Workers AI returns a ReadableStream directly (not a Response).
  const aiStream = await env.AI.run(modelFor(env), { messages, stream: true });
  const sourceStream = aiStream?.body ?? aiStream;

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    const reader = sourceStream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const assistantId = uuid();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const token = parsed.response ?? "";
            if (token) {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "token", token })}\n\n`));
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
      await writer.write(
        encoder.encode(`data: ${JSON.stringify({ type: "done", assistantMessageId: assistantId })}\n\n`)
      );
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } catch (err) {
      await writer.write(
        encoder.encode(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`)
      );
    } finally {
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      ...CORS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// --- /api/relay/step ---------------------------------------------------------

async function handleRelayStep(request, env) {
  const { goal, transcript = [], turn = 1, maxTurns = 4, partnerName = "the page AI" } = await request.json();

  const isFirst = turn === 1;
  const isLast = turn >= maxTurns;

  const convo = transcript
    .map((t) => `${t.from === "rovo" ? partnerName : "User"}: ${t.text}`)
    .join("\n\n");

  const systemContent = [
    `You are an orchestration agent consulting ${partnerName} to achieve the user's goal.`,
    `Turn ${turn} of ${maxTurns}.`,
    isFirst ? "TURN 1: You MUST ask a clarifying question — never finish on the first turn." : "",
    isLast && !isFirst ? "LAST TURN: You MUST respond with action 'done'." : "",
    'Respond ONLY with valid JSON: {"action":"ask","message":"..."} or {"action":"done","final":"..."}',
  ]
    .filter(Boolean)
    .join("\n");

  const result = await env.AI.run(modelFor(env), {
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: `GOAL: ${goal}\n\n${convo ? `Conversation:\n${convo}\n\n` : ""}Decide next step.`,
      },
    ],
  });

  const raw = (result.response ?? "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  let parsed = null;
  if (start !== -1 && end !== -1) {
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      // fall through
    }
  }

  if (!parsed || (parsed.action !== "ask" && parsed.action !== "done")) {
    return json({ action: "done", final: "", needsConclusion: true });
  }
  if (parsed.action === "ask" && isLast && turn > 1) {
    return json({ action: "done", final: "", needsConclusion: true });
  }
  return json(parsed);
}

// --- /api/relay/conclude -----------------------------------------------------

async function handleRelayConclude(request, env) {
  const { goal, transcript = [], partnerName = "the page AI" } = await request.json();

  const convo = transcript
    .map((t) => `${t.from === "rovo" ? partnerName : "User asked"}: ${t.text}`)
    .join("\n\n");

  const result = await env.AI.run(modelFor(env), {
    messages: [
      {
        role: "system",
        content:
          "Summarise the conversation for the user. Start with '**Conclusion:** ' then '**Details:**'. Be clear and concise. No JSON, no questions.",
      },
      { role: "user", content: `GOAL: ${goal}\n\nConversation:\n${convo}\n\nWrite the final conclusion.` },
    ],
  });

  return json({ text: result.response ?? "" });
}

// --- /api/connectors/search --------------------------------------------------

async function handleConnectorSearch(request) {
  const { connectorId, query, credentials } = await request.json();
  const { siteUrl, email, apiToken } = credentials ?? {};

  if (!siteUrl || !email || !apiToken) {
    return json({ connectorId, label: connectorId, results: [] });
  }

  const basicAuth = `Basic ${btoa(`${email}:${apiToken}`)}`;
  const base = siteUrl.replace(/\/$/, "");
  let results = [];

  try {
    if (connectorId === "jira") {
      const jql = encodeURIComponent(`text ~ "${query.replace(/"/g, "")}" ORDER BY updated DESC`);
      const resp = await fetch(`${base}/rest/api/3/search?jql=${jql}&maxResults=5&fields=summary,status`, {
        headers: { Authorization: basicAuth, Accept: "application/json" },
      });
      if (resp.ok) {
        const data = await resp.json();
        results = (data.issues ?? []).map((i) => ({
          title: `${i.key}: ${i.fields?.summary ?? ""}`,
          url: `${base}/browse/${i.key}`,
          snippet: i.fields?.status?.name ?? "",
        }));
      }
    } else if (connectorId === "confluence") {
      const cql = encodeURIComponent(`text ~ "${query.replace(/"/g, "")}"`);
      const resp = await fetch(`${base}/wiki/rest/api/search?cql=${cql}&limit=5`, {
        headers: { Authorization: basicAuth, Accept: "application/json" },
      });
      if (resp.ok) {
        const data = await resp.json();
        results = (data.results ?? []).map((r) => ({
          title: r.title ?? r.content?.title ?? "Confluence page",
          url: r._links?.webui ? `${base}/wiki${r._links.webui}` : base,
          snippet: r.excerpt ?? "",
        }));
      }
    }
  } catch {
    // return empty results on error
  }

  const label = connectorId === "jira" ? "Jira" : connectorId === "confluence" ? "Confluence" : connectorId;
  return json({ connectorId, label, results });
}

// --- Stub conversation endpoints (standalone — state lives in extension) ------

function handleConversations(request) {
  if (request.method === "GET") return json([]);
  if (request.method === "POST") {
    return json({ id: uuid(), title: "New chat", createdAt: new Date().toISOString(), messages: [] });
  }
  return cors("Method not allowed", { status: 405 });
}

function handleConversation(request, id) {
  if (request.method === "GET") return json({ id, title: "Chat", messages: [] });
  if (request.method === "DELETE") return json({ ok: true });
  if (request.method === "PATCH") return json({ id, ok: true });
  return cors("Method not allowed", { status: 405 });
}

// --- Main fetch handler ------------------------------------------------------

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (!authorized(request, env)) {
      return cors("Unauthorized", { status: 401 });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Health
      if (path === "/health" || path === "/api/health") {
        return json({ ok: true, provider: "cloudflare-workers-ai", model: modelFor(env) });
      }

      // Auth — always authenticated in standalone Worker mode
      if (path === "/api/auth/me") {
        return json({
          authenticated: true,
          standalone: true,
          user: { email: "local@standalone", displayName: "You", role: "user" },
          plugins: [],
        });
      }
      if (path === "/api/auth/login" && request.method === "POST") {
        return json({ authenticated: true, standalone: true });
      }
      if (path === "/api/auth/logout" && request.method === "POST") {
        return json({ ok: true });
      }

      // Chat
      if (path === "/api/chat" && request.method === "POST") return handleChat(request, env);
      if (path === "/api/relay/step" && request.method === "POST") return handleRelayStep(request, env);
      if (path === "/api/relay/conclude" && request.method === "POST") return handleRelayConclude(request, env);

      // Connector search (pass credentials directly — no OAuth needed)
      if (path === "/api/connectors/search" && request.method === "POST") return handleConnectorSearch(request);

      // Conversations (stubbed — extension manages state locally)
      if (path === "/api/conversations") return handleConversations(request);
      const convMatch = path.match(/^\/api\/conversations\/([^/]+)$/);
      if (convMatch) return handleConversation(request, convMatch[1]);

      return cors("Not found", { status: 404 });
    } catch (err) {
      return json({ error: err.message ?? "Internal error" }, { status: 500 });
    }
  },
};

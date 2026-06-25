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

// Workers AI defaults to a very low max output (~256 tokens), which truncates
// replies mid-sentence. Use a generous default, overridable via `MAX_TOKENS`.
function maxTokensFor(env) {
  const n = parseInt(env.MAX_TOKENS, 10);
  return Number.isFinite(n) && n > 0 ? n : 4096;
}

// ── Vision: let the assistant "see" attached images ──────────────────────────
// The chat model is text-only, so each image is read by a vision model and its
// description is fed into the prompt as text.
const VISION_MODEL_DEFAULT = "@cf/llava-hf/llava-1.5-7b-hf";
function visionModelFor(env) {
  return env.VISION_MODEL || VISION_MODEL_DEFAULT;
}

function base64ToBytes(b64) {
  const clean = String(b64 ?? "").replace(/^data:[^;]+;base64,/, "");
  const bin = atob(clean);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  return arr;
}

function isImageAttachment(a) {
  return (
    (a?.type || "").toLowerCase().startsWith("image/") ||
    a?.kind === "image" ||
    /\.(png|jpe?g|gif|webp|bmp)$/i.test(a?.name || "")
  );
}

async function describeImage(env, attachment, question) {
  try {
    const bytes = [...base64ToBytes(attachment.content || "")];
    if (!bytes.length) return "";
    const prompt = [
      "You are reading an image a user attached in a chat.",
      attachment.name ? `File name: ${attachment.name}` : "",
      question ? `The user's message: "${String(question).slice(0, 400)}"` : "",
      "Describe it thoroughly and transcribe ALL visible text, numbers, table data,",
      "labels, form fields, charts, diagrams and UI elements accurately.",
    ].filter(Boolean).join("\n");
    const res = await env.AI.run(visionModelFor(env), { image: bytes, prompt, max_tokens: 1024 });
    const d = res?.description ?? res?.response ?? (typeof res === "string" ? res : "");
    return String(d || "").trim().slice(0, 6000);
  } catch (e) {
    console.warn("[vision] failed:", e.message);
    return "";
  }
}

// Sampling parameters — lower temperature favours accuracy/consistency, which is
// what makes answers feel "smart" for a work assistant. Override via env.
function genParams(env) {
  const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  return { temperature: num(env.TEMPERATURE, 0.4), top_p: num(env.TOP_P, 0.9) };
}

const SYSTEM_PROMPT = `You are OneChat, an expert, general-purpose AI assistant. You help with writing, research, analysis, planning, project management, troubleshooting and everyday questions across any topic.

How to think (do this silently — never show your working):
- Read the request carefully and identify exactly what is being asked and any implicit constraints.
- Reason step by step internally, then give only the final, well-organised answer.
- Be accurate above all. If you are not sure, say so plainly and state what you'd need to confirm — never invent product behaviour, menu paths, figures, or citations.
- Use any provided page context, attachments, and retrieved file excerpts as the source of truth; prefer them over generic knowledge and cite which file/source a fact came from.
- You CAN see attached images: their contents are given to you in an "[Image analysis]" block. Treat that as your own visual reading of the image and answer/review accordingly — never claim you cannot view images or files.
- For multi-step or technical questions, give concrete, specific, actionable detail (exact steps, settings, fields, options) rather than vague generalities.
- For calculations, work through them carefully and double-check the result.
- If the request is genuinely ambiguous and a wrong assumption would waste the user's time, ask one short clarifying question first; otherwise state your assumption briefly and proceed.
- Match depth to the task: quick for simple asks, thorough for complex ones. Be concise and professional — no filler, no flattery, no restating the question.

Formatting rules — match the format to what is being asked:

1. PROBLEM / ISSUE / TROUBLESHOOTING requests (an error, bug, something "not working", "why can't I…", "how do I fix/resolve…", or any issue to diagnose): use a structured layout with short "##" headings, e.g.:
   ## Issue Summary
   ## Possible Cause
   ## Recommended Steps   (use a "-" bullet list)
   ## Next Steps
   Only include the headings that are relevant.

2. EVERYTHING ELSE — greetings, small talk ("how are you"), simple or factual questions, quick how-tos, opinions: reply briefly and conversationally in plain sentences. Do NOT use headings or the issue template. One short paragraph (or a few bullets) is plenty. Never pad a simple answer into sections.

General:
- Always use clean Markdown with a blank line between paragraphs and lists. Never produce one giant run-on paragraph.
- Don't invent sections that aren't needed, and don't restate the question.
- When the user attaches a document, summarise and answer from it — do NOT paste back large blocks of raw text or add a "Source:" dump. Quote at most a short relevant snippet.`;

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

// ── RAG over uploaded files (Cloudflare Vectorize) ───────────────────────────
// Enabled only when a [[vectorize]] binding named VECTORIZE is configured. Text
// attachments are chunked, embedded and upserted so future chats can retrieve
// them; each chat also queries the index for relevant snippets first.

const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5"; // 768-dim

function ragEnabled(env) {
  return Boolean(env.VECTORIZE && env.AI);
}

async function embed(env, text) {
  const res = await env.AI.run(EMBED_MODEL, { text: String(text).slice(0, 4000) });
  return res?.data?.[0] ?? null;
}

function chunkText(text, size = 1400, overlap = 150) {
  const clean = String(text ?? "").replace(/\s+\n/g, "\n").trim();
  if (!clean) return [];
  const chunks = [];
  for (let i = 0; i < clean.length && chunks.length < 60; i += size - overlap) {
    chunks.push(clean.slice(i, i + size));
  }
  return chunks;
}

async function djb2(str) {
  // Tiny stable hash for vector ids (avoids pulling in crypto).
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Index every text attachment for later retrieval. Best-effort; never throws.
async function ingestAttachmentsToVectorize(env, conversationId, attachments) {
  if (!ragEnabled(env)) return;
  try {
    const vectors = [];
    for (const a of attachments) {
      if (a.encoding === "base64" || !a.content) continue; // only real text
      const chunks = chunkText(a.content);
      for (let i = 0; i < chunks.length; i += 1) {
        const values = await embed(env, chunks[i]);
        if (!values) continue;
        vectors.push({
          id: `att-${conversationId || "x"}-${await djb2(`${a.name}:${i}:${chunks[i].slice(0, 24)}`)}`,
          values,
          metadata: {
            conversationId: String(conversationId || ""),
            fileName: String(a.name || "file"),
            snippet: chunks[i].slice(0, 600),
          },
        });
      }
    }
    if (vectors.length) await env.VECTORIZE.upsert(vectors);
  } catch (e) {
    console.warn("[rag] ingest failed:", e.message);
  }
}

// Retrieve the most relevant uploaded snippets for this query/conversation.
async function retrieveFromVectorize(env, conversationId, query) {
  if (!ragEnabled(env) || !query?.trim()) return "";
  try {
    const vector = await embed(env, query);
    if (!vector) return "";
    const res = await env.VECTORIZE.query(vector, { topK: 8, returnMetadata: true });
    const matches = (res?.matches ?? [])
      .filter((m) => m.score > 0.6)
      .filter((m) => !conversationId || !m.metadata?.conversationId || m.metadata.conversationId === String(conversationId))
      .slice(0, 5);
    if (!matches.length) return "";
    const blocks = matches.map(
      (m) => `• (${m.metadata?.fileName || "file"}) ${String(m.metadata?.snippet || "").trim()}`,
    );
    return `Relevant excerpts from previously uploaded files:\n${blocks.join("\n")}`;
  } catch (e) {
    console.warn("[rag] retrieve failed:", e.message);
    return "";
  }
}

async function handleChat(request, env, ctx) {
  const body = await request.json();
  const { conversationId, message = "", history = [], attachments = [], pageContext, rag = true } = body;

  // Build full message array for the model
  const prior = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.id !== "welcome" && m.content)
    .map((m) => ({ role: m.role, content: String(m.content) }));

  let userContent = message;
  if (pageContext?.text) {
    userContent += `\n\n[Page context — ${pageContext.title ?? pageContext.url ?? "current tab"}]\n${pageContext.text.slice(0, 4000)}`;
  }
  const imageAtts = (attachments ?? []).filter(isImageAttachment);
  const fileAtts = (attachments ?? []).filter((a) => !isImageAttachment(a));

  if (fileAtts.length > 0) {
    // Inline any text we have (the client extracts spreadsheets/CSV/text/code to
    // text before sending). Other base64 binaries (Word) are noted by name.
    const parts = fileAtts.map((a) => {
      if (a.encoding === "base64") {
        return `[Attached file "${a.name}" (${a.type || "binary"}) — open it in the full app to have its contents read.]`;
      }
      if (a.content) {
        // Cap inline size so one big upload can't blow the context window; the
        // full text is still indexed into RAG for retrieval on later messages.
        return `### Attached file: ${a.name}\n${String(a.content).slice(0, 24_000)}`;
      }
      return `[Attachment: ${a.name}]`;
    });
    userContent += `\n\n${parts.join("\n\n")}`;
  }

  // Run each attached image through the vision model and feed its reading in as
  // text so the assistant can "see" and review images.
  if (imageAtts.length > 0 && env.AI) {
    const descs = [];
    for (const img of imageAtts) {
      const d = await describeImage(env, img, message);
      descs.push(`### Image: ${img.name}\n${d || "(this image could not be read)"}`);
    }
    userContent += `\n\n[Image analysis — a vision model's reading of the attached image(s); treat this as your own view of the images]\n${descs.join("\n\n")}`;
  }

  // RAG (skipped when the user turned "remember uploads" off in Settings).
  if (rag !== false) {
    // Pull in relevant snippets from previously uploaded files for this chat.
    const ragContext = await retrieveFromVectorize(env, conversationId, message);
    if (ragContext) {
      userContent += `\n\n[Knowledge from your uploaded files]\n${ragContext}`;
    }

    // Index this turn's text attachments for future retrieval (don't block the
    // response — runs after we return via waitUntil when available).
    const textAttachments = (attachments ?? []).filter((a) => a.encoding !== "base64" && a.content);
    if (textAttachments.length) {
      const job = ingestAttachmentsToVectorize(env, conversationId, textAttachments);
      if (ctx?.waitUntil) ctx.waitUntil(job);
      else void job;
    }
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...prior,
    { role: "user", content: userContent || "(no message)" },
  ];

  return streamModel(env, messages);
}

// Regenerate: re-run the last user turn. The extension sends the running history
// (standalone mode keeps no server state); we drop any trailing assistant turn.
async function handleRegenerate(request, env) {
  const body = await request.json();
  const { history = [] } = body;

  const prior = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.id !== "welcome" && m.content)
    .map((m) => ({ role: m.role, content: String(m.content) }));
  while (prior.length && prior[prior.length - 1].role === "assistant") prior.pop();

  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...prior];
  if (messages.length === 1) messages.push({ role: "user", content: "(no message)" });

  return streamModel(env, messages);
}

// How many continuation rounds are allowed when an answer hits the token cap.
function maxRoundsFor(env) {
  const n = parseInt(env.MAX_CONTINUATIONS, 10);
  return Number.isFinite(n) && n > 0 ? n : 6;
}

// The model's total context window (input + output). Workers AI rejects requests
// where estimated input + max_tokens exceeds this (error 5021). Default matches
// llama-3.3-70b-fp8-fast; override with CONTEXT_WINDOW.
function contextWindowFor(env) {
  const n = parseInt(env.CONTEXT_WINDOW, 10);
  return Number.isFinite(n) && n > 0 ? n : 24000;
}

// Rough token estimate (≈4 chars/token) — good enough to stay under the limit.
function estTokens(str) {
  return Math.ceil(String(str ?? "").length / 4);
}

// Trim a message list to fit the context window and return a safe max_tokens for
// the output. Keeps the system prompt and the latest user turn; drops the oldest
// in-between turns first, then truncates the tail of the last message if needed.
function fitToContext(env, messages) {
  const window = contextWindowFor(env);
  const margin = 600; // headroom for the chat template / estimate error
  const minOut = 700;
  const desiredOut = maxTokensFor(env);

  let msgs = messages.map((m) => ({ ...m, content: String(m.content ?? "") }));
  const total = (arr) => arr.reduce((n, m) => n + estTokens(m.content) + 8, 0);

  // Drop oldest middle turns (keep system at [0] and the final turn).
  while (msgs.length > 2 && total(msgs) + minOut > window - margin) {
    msgs.splice(1, 1);
  }

  // Still too big → truncate the END of the last message (preserves the question
  // at the start, trims the bulky attachment/context that follows it).
  let inputEst = total(msgs);
  if (inputEst + minOut > window - margin) {
    const last = msgs[msgs.length - 1];
    const othersEst = inputEst - estTokens(last.content);
    const allowedChars = Math.max(0, (window - margin - minOut - othersEst) * 4);
    last.content = last.content.slice(0, allowedChars) + "\n\n…[trimmed to fit the model's context limit]";
    inputEst = total(msgs);
  }

  const maxTokens = Math.max(minOut, Math.min(desiredOut, window - margin - inputEst));
  return { messages: msgs, maxTokens };
}

// Shared SSE streamer for chat + regenerate. Auto-continues: if the model stops
// because it hit the per-call token cap, we re-prompt it to keep going and stream
// the continuation seamlessly — so long answers always finish instead of cutting
// off mid-sentence.
async function streamModel(env, baseMessages) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const maxRounds = maxRoundsFor(env);

  (async () => {
    const assistantId = uuid();
    let messages = [...baseMessages];

    try {
      for (let round = 0; round < maxRounds; round += 1) {
        // Fit to the model's context window and size the output budget so input +
        // output never exceeds it (avoids Workers AI error 5021).
        const fitted = fitToContext(env, messages);
        const maxTokens = fitted.maxTokens;
        const aiStream = await env.AI.run(modelFor(env), {
          messages: fitted.messages,
          stream: true,
          max_tokens: maxTokens,
          ...genParams(env),
        });
        const sourceStream = aiStream?.body ?? aiStream;
        const reader = sourceStream.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let roundText = "";
        let chunkCount = 0;
        let completionTokens = 0;
        let finishReason = null;

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
              if (parsed.usage?.completion_tokens != null) completionTokens = parsed.usage.completion_tokens;
              if (parsed.finish_reason) finishReason = parsed.finish_reason;
              const token = parsed.response ?? "";
              if (token) {
                roundText += token;
                chunkCount += 1;
                await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "token", token })}\n\n`));
              }
            } catch {
              // skip malformed chunks
            }
          }
        }

        // Decide whether the answer was cut off. We can't always trust the token
        // count (Workers AI may cap below our max_tokens and omit finish_reason),
        // so ALSO treat a round that ends mid-sentence as truncated.
        const tokensOut = completionTokens || chunkCount;
        const trimmed = roundText.trim();
        const endsClean =
          finishReason === "stop" ||
          /[.!?:;)\]}"'`’”…]\s*$/.test(trimmed) ||
          /```\s*$/.test(trimmed);
        const truncated =
          finishReason === "length" ||
          tokensOut >= maxTokens * 0.95 ||
          (!endsClean && trimmed.length > 40);
        if (!truncated || !trimmed) break;

        // Re-prompt to continue. Only the TAIL of what was written is needed for
        // continuity, so we keep the input bounded across rounds.
        messages = [
          ...messages,
          { role: "assistant", content: trimmed.slice(-2000) },
          {
            role: "user",
            content:
              "Continue your previous answer from exactly where it stopped. Do not repeat any text you already wrote, and do not add a preamble — just keep going.",
          },
        ];
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
    max_tokens: maxTokensFor(env),
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
    max_tokens: maxTokensFor(env),
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
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (!authorized(request, env)) {
      return cors("Unauthorized", { status: 401 });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Health
      if (path === "/health" || path === "/api/health") {
        return json({ ok: true, provider: "cloudflare-workers-ai", model: modelFor(env), ragEnabled: ragEnabled(env) });
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
      if (path === "/api/chat" && request.method === "POST") return handleChat(request, env, ctx);
      if (path === "/api/chat/regenerate" && request.method === "POST") return handleRegenerate(request, env);
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

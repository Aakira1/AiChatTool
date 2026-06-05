import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  deleteMessageById,
  deleteMessagesAfter,
  getConversationById,
  getLastUserMessage,
  insertMessage,
  setConversationTitle,
  updateUserMessageContent,
} from "../db/repositories/conversationRepo.js";
import { deriveConversationTitle } from "../services/promptBuilder.js";
import { buildResponseArtifacts } from "../services/artifactService.js";
import {
  prepareAssistantMessages,
  resolveAiProvider,
  streamFromMessages,
} from "../services/chatService.js";
import { ingestAttachments } from "../services/ragService.js";
import { extractSearchPhrase } from "../utils/searchPhrase.js";
import { sanitizeAttachments } from "../utils/documentText.js";

const pageContextObjectSchema = z.object({
  url: z.string().max(2000).optional(),
  title: z.string().max(500).optional(),
  selection: z.string().max(8000).optional(),
  excerpt: z.string().max(8000).optional(),
  /** JPEG/PNG data URL from chrome.tabs.captureVisibleTab (extension eye icon) */
  screenshot: z.string().max(2_000_000).optional(),
  visualDescription: z.string().max(5000).optional(),
});

const pageContextSchema = pageContextObjectSchema.optional();

/** Extension UI stores screenshot: null and may send pageContext: null — coerce for Zod. */
function normalizePageContext(pageContext) {
  if (pageContext == null) {
    return undefined;
  }
  if (typeof pageContext !== "object") {
    return undefined;
  }

  const allowed = ["url", "title", "selection", "excerpt", "screenshot", "visualDescription"];
  const out = {};
  for (const key of allowed) {
    const value = pageContext[key];
    if (value == null || value === "") {
      continue;
    }
    if (key === "screenshot" && typeof value === "string" && value.length > 2_000_000) {
      continue;
    }
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeChatBody(body) {
  if (!body || typeof body !== "object") {
    return body;
  }
  return {
    ...body,
    pageContext: normalizePageContext(body.pageContext),
  };
}

/** Don't persist multi-hundred-KB screenshots in SQLite message metadata. */
function pageContextForStorage(pageContext) {
  if (!pageContext) return null;
  const { screenshot: _omit, ...rest } = pageContext;
  return {
    ...rest,
    hadScreenshot: Boolean(pageContext.screenshot),
  };
}

const attachmentSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.string().max(100).optional(),
  // base64 encoding is used for binary docs (.pdf/.docx) — a 10MB file is
  // ~14M base64 chars, so allow generous headroom. Plain text stays small.
  encoding: z.enum(["base64"]).optional(),
  content: z.string().min(1).max(14_000_000),
  size: z.number().int().nonnegative().optional(),
});

const connectorIdSchema = z.enum([
  "google-drive",
  "onedrive",
  "sharepoint",
  "teams",
  "jira",
  "confluence",
]);

const chatSchema = z
  .object({
    conversationId: z.string().min(1),
    message: z.string().trim().max(12_000),
    pageContext: pageContextSchema,
    attachments: z.array(attachmentSchema).max(3).optional(),
    aiProvider: z.enum(["default", "copilot-studio"]).optional(),
    connectorSources: z.array(connectorIdSchema).max(6).optional(),
    reasoning: z.enum(["auto", "quick", "deep", "research"]).optional(),
    sources: z
      .object({
        webSearch: z.boolean().optional(),
        companyKnowledge: z.boolean().optional(),
      })
      .optional(),
  })
  .refine(
    (data) =>
      data.message.length > 0 ||
      (data.attachments?.length ?? 0) > 0 ||
      Boolean(data.pageContext?.screenshot),
    { message: "Provide a message, screenshot, or at least one attachment" },
  );

const actionSchema = z.object({
  conversationId: z.string().min(1),
  aiProvider: z.enum(["default", "copilot-studio"]).optional(),
});

const editSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  content: z.string().trim().min(1).max(12_000),
  aiProvider: z.enum(["default", "copilot-studio"]).optional(),
});

export const chatRouter = Router();

async function runAssistantStream({
  response,
  next,
  conversationId,
  history,
  userMessage,
  attachments,
  pageContext,
  request,
  aiProvider: requestedAiProvider = "default",
  connectorSources = [],
  reasoning = "auto",
  sources = {},
}) {
  let assistantContent = "";
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), env.requestTimeoutMs);
  request.on("close", () => abortController.abort());

  try {
    const { messages, knowledgeChunks } = await prepareAssistantMessages({
      history,
      latestUserMessage: userMessage,
      attachments,
      pageContext,
      conversationId,
      connectorSources,
      userEmail: request.user?.email || env.authEmail || "local-user",
      reasoning,
      sources,
      signal: abortController.signal,
    });

    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders?.();

    const aiProvider = resolveAiProvider(requestedAiProvider);

    for await (const token of streamFromMessages({
      messages,
      signal: abortController.signal,
      aiProvider,
    })) {
      assistantContent += token;
      response.write(`data: ${JSON.stringify({ type: "token", token })}\n\n`);
    }

    const { artifacts, insights } = buildResponseArtifacts(userMessage, { knowledgeChunks });
    const assistantMessage = insertMessage({
      conversationId,
      role: "assistant",
      content: assistantContent,
      metadata: {
        source: "chat-stream",
        pageContext: pageContext ?? null,
        artifacts,
        insights,
        retrievedChunks: knowledgeChunks.map((chunk) => ({
          id: chunk.id,
          title: chunk.title,
          sourceType: chunk.sourceType,
          score: chunk.score,
        })),
        reviewedAt: new Date().toISOString(),
      },
    });

    response.write(
      `data: ${JSON.stringify({
        type: "done",
        assistantMessageId: assistantMessage.id,
        artifacts,
        insights,
      })}\n\n`,
    );
    response.write("data: [DONE]\n\n");
    response.end();
  } catch (error) {
    if (!response.headersSent) {
      next(error);
      return;
    }
    response.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
    response.end();
  } finally {
    clearTimeout(timeout);
  }
}

chatRouter.post("/regenerate", async (request, response, next) => {
  const parsed = actionSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid regenerate payload" });
    return;
  }

  const conversation = getConversationById(parsed.data.conversationId);
  if (!conversation) {
    response.status(404).json({ error: "Conversation not found" });
    return;
  }

  const lastAssistant = [...conversation.messages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) {
    response.status(400).json({ error: "No assistant message to regenerate" });
    return;
  }

  const lastUser = getLastUserMessage(parsed.data.conversationId);
  if (!lastUser) {
    response.status(400).json({ error: "No user message found" });
    return;
  }

  deleteMessageById(lastAssistant.id);
  const history = conversation.messages.filter((message) => message.id !== lastAssistant.id);

  await runAssistantStream({
    response,
    next,
    conversationId: parsed.data.conversationId,
    history,
    userMessage: lastUser.content,
    attachments: [],
    pageContext: lastUser.metadata?.pageContext ?? null,
    request,
    aiProvider: parsed.data.aiProvider ?? "default",
  });
});

chatRouter.post("/edit", async (request, response, next) => {
  const parsed = editSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid edit payload" });
    return;
  }

  const conversation = getConversationById(parsed.data.conversationId);
  if (!conversation) {
    response.status(404).json({ error: "Conversation not found" });
    return;
  }

  const target = conversation.messages.find((message) => message.id === parsed.data.messageId);
  if (!target || target.role !== "user") {
    response.status(400).json({ error: "Can only edit user messages" });
    return;
  }

  const messageIndex = conversation.messages.findIndex(
    (message) => message.id === parsed.data.messageId,
  );

  deleteMessagesAfter(parsed.data.conversationId, parsed.data.messageId);
  updateUserMessageContent(parsed.data.messageId, parsed.data.content);

  const refreshed = getConversationById(parsed.data.conversationId);
  const history = refreshed.messages.slice(0, messageIndex);

  await runAssistantStream({
    response,
    next,
    conversationId: parsed.data.conversationId,
    history,
    userMessage: parsed.data.content,
    attachments: [],
    pageContext: target.metadata?.pageContext ?? null,
    request,
    aiProvider: parsed.data.aiProvider ?? "default",
  });
});

chatRouter.post("/", async (request, response, next) => {
  const parsed = chatSchema.safeParse(normalizeChatBody(request.body));
  if (!parsed.success) {
    const details = parsed.error.flatten();
    console.warn("[CiA] POST /api/chat validation failed", details.fieldErrors);
    response.status(400).json({
      error: "Invalid chat payload",
      details: details.fieldErrors,
    });
    return;
  }

  const conversation = getConversationById(parsed.data.conversationId);
  if (!conversation) {
    response.status(404).json({ error: "Conversation not found" });
    return;
  }

  let attachments = [];
  try {
    attachments = await sanitizeAttachments(parsed.data.attachments ?? []);
  } catch (attachmentError) {
    response.status(400).json({ error: attachmentError.message });
    return;
  }

  const isFirstMessage = conversation.messages.length === 0;
  const searchPhrase = extractSearchPhrase(parsed.data.message);

  insertMessage({
    conversationId: parsed.data.conversationId,
    role: "user",
    content: parsed.data.message,
    metadata: {
      source: "chat-stream",
      pageContext: pageContextForStorage(parsed.data.pageContext),
      searchPhrase,
      attachments: attachments.map(({ name, type, size }) => ({ name, type, size })),
      connectorSources: parsed.data.connectorSources ?? [],
    },
  });

  if (isFirstMessage || conversation.title === "New chat") {
    const titleSource =
      parsed.data.message ||
      attachments.map((file) => file.name).join(", ") ||
      "Document review";
    setConversationTitle(parsed.data.conversationId, deriveConversationTitle(titleSource));
  }

  if (attachments.length > 0) {
    void ingestAttachments(parsed.data.conversationId, attachments).catch((error) => {
      console.warn("Attachment vector ingest failed:", error.message);
    });
  }

  await runAssistantStream({
    response,
    next,
    conversationId: parsed.data.conversationId,
    history: conversation.messages,
    userMessage: parsed.data.message,
    attachments,
    pageContext: parsed.data.pageContext ?? null,
    request,
    aiProvider: parsed.data.aiProvider ?? "default",
    connectorSources: parsed.data.connectorSources ?? [],
    reasoning: parsed.data.reasoning ?? "auto",
    sources: parsed.data.sources ?? {},
  });
});

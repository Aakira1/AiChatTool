import { Router } from "express";
import { z } from "zod";
import {
  createConversation,
  deleteConversation,
  getConversationById,
  insertMessage,
  listArchivedConversationSummaries,
  listConversationSummaries,
  updateConversation,
} from "../db/repositories/conversationRepo.js";

const createSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
});

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(12_000),
  metadata: z.record(z.any()).nullable().optional(),
});

export const conversationsRouter = Router();

const patchSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
});

conversationsRouter.get("/", (request, response) => {
  const scope = request.query.archived;
  if (scope === "only") {
    response.json(listArchivedConversationSummaries());
    return;
  }
  if (scope === "all") {
    response.json(listConversationSummaries({ includeArchived: true }));
    return;
  }
  response.json(listConversationSummaries());
});

conversationsRouter.patch("/:conversationId", (request, response) => {
  const parsed = patchSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid conversation update" });
    return;
  }

  const updated = updateConversation(request.params.conversationId, parsed.data);
  if (!updated) {
    response.status(404).json({ error: "Conversation not found" });
    return;
  }
  response.json(updated);
});

conversationsRouter.post("/", (request, response) => {
  const parsed = createSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid create conversation payload" });
    return;
  }

  const title = parsed.data.title ?? "New chat";
  const created = createConversation(title);
  response.status(201).json(created);
});

conversationsRouter.get("/:conversationId", (request, response) => {
  const conversation = getConversationById(request.params.conversationId);
  if (!conversation) {
    response.status(404).json({ error: "Conversation not found" });
    return;
  }
  response.json(conversation);
});

conversationsRouter.delete("/:conversationId", (request, response) => {
  const deleted = deleteConversation(request.params.conversationId);
  if (!deleted) {
    response.status(404).json({ error: "Conversation not found" });
    return;
  }
  response.status(204).end();
});

conversationsRouter.post("/:conversationId/messages", (request, response) => {
  const parsed = messageSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid message payload" });
    return;
  }

  const conversation = getConversationById(request.params.conversationId);
  if (!conversation) {
    response.status(404).json({ error: "Conversation not found" });
    return;
  }

  const message = insertMessage({
    conversationId: request.params.conversationId,
    role: parsed.data.role,
    content: parsed.data.content,
    metadata: parsed.data.metadata ?? null,
  });

  response.status(201).json(message);
});

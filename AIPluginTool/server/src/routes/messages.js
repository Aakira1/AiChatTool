import { Router } from "express";
import { z } from "zod";
import { setMessageFeedback } from "../db/repositories/conversationRepo.js";

const feedbackSchema = z.object({
  rating: z.enum(["up", "down"]),
});

export const messagesRouter = Router();

messagesRouter.patch("/:messageId/feedback", (request, response) => {
  const parsed = feedbackSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid feedback payload" });
    return;
  }

  const updated = setMessageFeedback(request.params.messageId, parsed.data.rating);
  if (!updated) {
    response.status(404).json({ error: "Message not found" });
    return;
  }

  response.json(updated);
});

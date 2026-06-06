import { Router } from "express";
import { z } from "zod";
import { assistBpa } from "../services/bpaService.js";

export const bpaRouter = Router();

const assistSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  tasks: z.array(z.string().max(200)).max(100).optional(),
  decisions: z.array(z.string().max(200)).max(200).optional(),
});

bpaRouter.post("/assist", async (request, response) => {
  const parsed = assistSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Provide a prompt" });
    return;
  }
  try {
    const result = await assistBpa({
      prompt: parsed.data.prompt,
      tasks: parsed.data.tasks ?? [],
      decisions: parsed.data.decisions ?? [],
    });
    response.json(result);
  } catch (error) {
    response.status(502).json({ error: error.message ?? "Assist failed" });
  }
});

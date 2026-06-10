import { Router } from "express";
import { z } from "zod";
import { describeImage } from "../services/visionService.js";

export const visionRouter = Router();

const describeSchema = z.object({
  imageBase64: z.string().min(1).max(30_000_000),
  prompt: z.string().max(30_000_000).optional(),
  name: z.string().max(30_000_000).optional(),
});

// Read/describe an image (e.g. a screenshot of an on-page AI chat) with the
// vision model — gives the assistant "eyes" on what's visible.
visionRouter.post("/describe", async (request, response) => {
  const parsed = describeSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Provide an image" });
    return;
  }
  try {
    const text = await describeImage(parsed.data.imageBase64, {
      name: parsed.data.name ?? "screenshot",
      userPrompt: parsed.data.prompt,
    });
    response.json({ text: text ?? "" });
  } catch (error) {
    response.status(502).json({ error: error.message ?? "Vision failed" });
  }
});

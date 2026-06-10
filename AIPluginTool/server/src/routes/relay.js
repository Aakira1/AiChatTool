import { Router } from "express";
import { z } from "zod";
import { planRelayStep, concludeRelay } from "../services/relayAgentService.js";

export const relayRouter = Router();

const stepSchema = z.object({
  goal: z.string().trim().min(1).max(4000),
  transcript: z
    .array(
      z.object({
        from: z.enum(["agent", "rovo"]),
        text: z.string().max(20000),
      }),
    )
    .max(20)
    .optional(),
  turn: z.number().int().min(1).max(10).optional(),
  maxTurns: z.number().int().min(1).max(8).optional(),
  partnerName: z.string().max(60).optional(),
});

// Decide the next step of an agentic conversation with an on-page AI.
relayRouter.post("/step", async (request, response) => {
  const parsed = stepSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Provide a goal" });
    return;
  }
  try {
    const result = await planRelayStep({
      goal: parsed.data.goal,
      transcript: parsed.data.transcript ?? [],
      turn: parsed.data.turn ?? 1,
      maxTurns: parsed.data.maxTurns ?? 4,
      partnerName: parsed.data.partnerName ?? "the page AI",
    });
    response.json(result);
  } catch (error) {
    response.status(502).json({ error: error.message ?? "Relay step failed" });
  }
});

// Final pass: synthesise the user-facing conclusion from the whole exchange.
relayRouter.post("/conclude", async (request, response) => {
  const parsed = stepSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Provide a goal" });
    return;
  }
  try {
    const final = await concludeRelay({
      goal: parsed.data.goal,
      transcript: parsed.data.transcript ?? [],
      partnerName: parsed.data.partnerName ?? "the page AI",
    });
    response.json({ final });
  } catch (error) {
    response.status(502).json({ error: error.message ?? "Conclusion failed" });
  }
});

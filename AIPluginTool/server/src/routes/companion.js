import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { getCompanion, saveCompanion } from "../db/repositories/companionRepo.js";

export const companionRouter = Router();

const saveSchema = z.object({
  fileName: z.string().max(300).optional(),
  // A CSV grid: rows of string cells. Bounded to keep payloads sane.
  rows: z.array(z.array(z.string().max(20_000))).max(50_000).nullable().optional(),
});

function emailOf(request) {
  return request.user?.email || env.authEmail || "local-user";
}

companionRouter.get("/", (request, response) => {
  const state = getCompanion(emailOf(request));
  response.json(state ?? { fileName: "", rows: null });
});

companionRouter.put("/", (request, response) => {
  const parsed = saveSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid companion payload" });
    return;
  }
  saveCompanion(emailOf(request), parsed.data.fileName ?? "", parsed.data.rows ?? null);
  response.json({ ok: true });
});

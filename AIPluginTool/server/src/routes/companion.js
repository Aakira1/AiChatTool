import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { env } from "../config/env.js";
import { getCompanion, saveCompanion } from "../db/repositories/companionRepo.js";

export const companionRouter = Router();

// Convert an uploaded .xlsx (base64) into a CSV-style 2D grid of cell text so the
// Companion can analyse it the same way it does a CSV.
const parseSchema = z.object({
  dataBase64: z.string().min(1).max(30_000_000),
});

companionRouter.post("/parse-xlsx", async (request, response) => {
  const parsed = parseSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Provide the spreadsheet data" });
    return;
  }
  try {
    const buffer = Buffer.from(parsed.data.dataBase64, "base64");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws) {
      response.status(400).json({ error: "The workbook has no sheets" });
      return;
    }
    const colCount = ws.columnCount || 0;
    const rows = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const arr = [];
      for (let c = 1; c <= colCount; c += 1) arr.push(String(row.getCell(c).text ?? ""));
      rows.push(arr);
    });
    response.json({ rows });
  } catch (error) {
    response.status(400).json({ error: error.message || "Couldn't read the spreadsheet" });
  }
});

const saveSchema = z.object({
  fileName: z.string().max(300).optional(),
  // A CSV grid: rows of string cells. Bounded to keep payloads sane.
  rows: z.array(z.array(z.string().max(20_000))).max(50_000).nullable().optional(),
  // Optimistic concurrency: the updatedAt the client last synced with.
  baseUpdatedAt: z.string().max(40).optional(),
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
  const email = emailOf(request);
  const base = parsed.data.baseUpdatedAt;
  const current = getCompanion(email);

  // Optimistic concurrency: if the stored copy changed since the client loaded
  // it (e.g. edited in the other surface), reject and return the latest.
  if (base && current?.updatedAt && current.updatedAt !== base) {
    response.status(409).json({ conflict: true, ...current });
    return;
  }

  saveCompanion(email, parsed.data.fileName ?? "", parsed.data.rows ?? null);
  response.json({ ok: true, updatedAt: getCompanion(email)?.updatedAt ?? null });
});

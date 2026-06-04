import { Router } from "express";
import { z } from "zod";
import {
  buildSheetData,
  buildXlsxBuffer,
  safeFileName,
  sanitizeSheets,
} from "../services/documentService.js";

export const exportRouter = Router();

const xlsxSchema = z.object({
  content: z.string().trim().min(1).max(100_000),
  title: z.string().trim().max(120).optional(),
});

const sheetSpecSchema = z.object({
  name: z.string().trim().max(120).optional(),
  columns: z.array(z.any()).optional(),
  rows: z.array(z.any()).optional(),
});

const xlsxSpecSchema = z.object({
  title: z.string().trim().max(120).optional(),
  sheets: z.array(sheetSpecSchema).min(1).max(8),
});

// Convert chat/forum content into a downloadable .xlsx workbook.
exportRouter.post("/xlsx", async (request, response) => {
  const parsed = xlsxSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Provide non-empty content to export" });
    return;
  }

  const title = parsed.data.title || "AI Export";
  try {
    const sheets = await buildSheetData(parsed.data.content);
    const buffer = await buildXlsxBuffer({ title, sheets });
    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName(title)}.xlsx"`,
    );
    response.send(buffer);
  } catch (error) {
    response.status(502).json({ error: error.message ?? "Failed to build the spreadsheet" });
  }
});

// Build a downloadable .xlsx deterministically from a model-provided spec.
exportRouter.post("/xlsx-spec", async (request, response) => {
  const parsed = xlsxSpecSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Provide a sheets array to export" });
    return;
  }

  const title = parsed.data.title || "AI Export";
  try {
    const sheets = sanitizeSheets(parsed.data.sheets);
    const buffer = await buildXlsxBuffer({ title, sheets });
    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName(title)}.xlsx"`,
    );
    response.send(buffer);
  } catch (error) {
    response.status(502).json({ error: error.message ?? "Failed to build the spreadsheet" });
  }
});

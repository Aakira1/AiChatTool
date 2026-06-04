import { Router } from "express";
import { z } from "zod";
import {
  buildCsv,
  buildSheetData,
  buildXlsxBuffer,
  safeFileName,
  sanitizeSheets,
} from "../services/documentService.js";
import {
  buildDocxBuffer,
  buildPdfBuffer,
  buildPptxBuffer,
  safeDocName,
} from "../services/documentExportService.js";

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

const docSchema = z.object({
  content: z.string().trim().min(1).max(200_000),
  title: z.string().trim().max(120).optional(),
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

// Convert markdown content into a downloadable Word (.docx) document.
exportRouter.post("/docx", async (request, response) => {
  const parsed = docSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Provide non-empty content to export" });
    return;
  }

  const title = parsed.data.title || "Document";
  try {
    const buffer = await buildDocxBuffer({ title, content: parsed.data.content });
    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    response.setHeader("Content-Disposition", `attachment; filename="${safeDocName(title)}.docx"`);
    response.send(buffer);
  } catch (error) {
    response.status(502).json({ error: error.message ?? "Failed to build the document" });
  }
});

// Convert markdown content into a downloadable PowerPoint (.pptx) deck.
exportRouter.post("/pptx", async (request, response) => {
  const parsed = docSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Provide non-empty content to export" });
    return;
  }

  const title = parsed.data.title || "Presentation";
  try {
    const buffer = await buildPptxBuffer({ title, content: parsed.data.content });
    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    response.setHeader("Content-Disposition", `attachment; filename="${safeDocName(title)}.pptx"`);
    response.send(buffer);
  } catch (error) {
    response.status(502).json({ error: error.message ?? "Failed to build the presentation" });
  }
});

// Convert content into a downloadable CSV file (extracts tabular data).
exportRouter.post("/csv", async (request, response) => {
  const parsed = docSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Provide non-empty content to export" });
    return;
  }

  const title = parsed.data.title || "Data";
  try {
    const csv = await buildCsv(parsed.data.content);
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="${safeFileName(title)}.csv"`);
    response.send(csv);
  } catch (error) {
    response.status(502).json({ error: error.message ?? "Failed to build the CSV" });
  }
});

// Convert markdown content into a downloadable PDF document.
exportRouter.post("/pdf", async (request, response) => {
  const parsed = docSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Provide non-empty content to export" });
    return;
  }

  const title = parsed.data.title || "Document";
  try {
    const buffer = await buildPdfBuffer({ title, content: parsed.data.content });
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${safeDocName(title)}.pdf"`);
    response.send(buffer);
  } catch (error) {
    response.status(502).json({ error: error.message ?? "Failed to build the document" });
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

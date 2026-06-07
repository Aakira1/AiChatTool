import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { env } from "../config/env.js";
import { getCompanion, saveCompanion } from "../db/repositories/companionRepo.js";

export const companionRouter = Router();

// Robustly read a cell's display text. exceljs's `.text` getter can throw on
// some workbooks (formula results, hyperlinks, rich text with null parts), so
// fall back to inspecting `.value` defensively.
function cellText(cell) {
  try {
    const t = cell.text;
    if (t != null) return String(t);
  } catch {
    /* fall through to value inspection */
  }
  const v = cell.value;
  if (v == null) return "";
  if (typeof v !== "object") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v.richText)) return v.richText.map((p) => p?.text ?? "").join("");
  if (v.result != null) return String(v.result);
  if (v.text != null) return String(v.text);
  if (v.hyperlink != null) return String(v.hyperlink);
  return "";
}

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
    if (!wb.worksheets.length) {
      response.status(400).json({ error: "The workbook has no sheets" });
      return;
    }
    // Return EVERY sheet as its own grid — config companions split the checklist
    // across multiple stage sheets (Stage 1A, Stage 1B, …), not just sheet 0.
    const sheets = wb.worksheets.map((ws) => {
      const colCount = ws.columnCount || 0;
      const rows = [];
      ws.eachRow({ includeEmpty: true }, (row) => {
        const arr = [];
        for (let c = 1; c <= colCount; c += 1) arr.push(cellText(row.getCell(c)));
        rows.push(arr);
      });
      return { name: ws.name, rows };
    });
    // `rows` kept for older callers (the extension) = the first sheet's grid.
    response.json({ sheets, rows: sheets[0]?.rows ?? [] });
  } catch (error) {
    response.status(400).json({ error: error.message || "Couldn't read the spreadsheet" });
  }
});

// Re-emit the ORIGINAL .xlsx (base64) with only changed cell text applied, so
// styling, column widths, merged cells and formatting are preserved 1:1. We
// overwrite a cell's value only when its text actually differs from the grid.
const gridSchema = z.array(z.array(z.string().max(20_000))).max(50_000);
const exportSchema = z.object({
  dataBase64: z.string().min(1).max(30_000_000),
  rows: gridSchema.optional(),
  sheets: z.array(z.object({ name: z.string().max(300), rows: gridSchema })).max(50).optional(),
  // Precise cell edits: { sheet, row, col, value } (0-based row/col). Preferred —
  // only the listed cells are touched, so formulas/formatting/other sheets are
  // left byte-for-byte intact and recalc naturally in Excel.
  edits: z
    .array(
      z.object({
        sheet: z.string().max(300).optional(),
        row: z.number().int().min(0).max(1_000_000),
        col: z.number().int().min(0).max(16_384),
        value: z.string().max(20_000),
      }),
    )
    .max(100_000)
    .optional(),
});

// Apply a text grid onto a worksheet, only overwriting cells whose displayed
// text changed (keeps formulas, number formats, styling and merges intact).
function applyGrid(ws, grid) {
  for (let r = 0; r < grid.length; r += 1) {
    const rowArr = grid[r];
    const row = ws.getRow(r + 1);
    for (let c = 0; c < rowArr.length; c += 1) {
      const next = rowArr[c];
      const cell = row.getCell(c + 1);
      if (cellText(cell) !== next) cell.value = next === "" ? null : next;
    }
  }
}

companionRouter.post("/export-xlsx", async (request, response) => {
  const parsed = exportSchema.safeParse(request.body ?? {});
  if (!parsed.success || (!parsed.data?.rows && !parsed.data?.sheets && !parsed.data?.edits)) {
    response.status(400).json({ error: "Provide the original workbook and changes" });
    return;
  }
  try {
    const buffer = Buffer.from(parsed.data.dataBase64, "base64");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    if (!wb.worksheets.length) {
      response.status(400).json({ error: "The workbook has no sheets" });
      return;
    }
    if (parsed.data.edits?.length) {
      // Surgical: only the listed cells change; everything else (formulas,
      // styling, untouched sheets) stays exactly as the original template.
      for (const edit of parsed.data.edits) {
        const ws = edit.sheet ? (wb.getWorksheet(edit.sheet) ?? wb.worksheets[0]) : wb.worksheets[0];
        if (!ws) continue;
        const cell = ws.getRow(edit.row + 1).getCell(edit.col + 1);
        cell.value = edit.value === "" ? null : edit.value;
      }
    } else if (parsed.data.sheets?.length) {
      // Multi-sheet fallback: match each grid to its worksheet by name. applyGrid
      // only writes cells whose text changed, so formulas/styles stay intact.
      for (const sheet of parsed.data.sheets) {
        const ws = wb.getWorksheet(sheet.name) ?? wb.worksheets[0];
        if (ws) applyGrid(ws, sheet.rows);
      }
    } else {
      applyGrid(wb.worksheets[0], parsed.data.rows);
    }
    // Ask Excel to recompute dependent formulas (e.g. the Dashboard) on open.
    wb.calcProperties = { ...(wb.calcProperties ?? {}), fullCalcOnLoad: true };
    const out = await wb.xlsx.writeBuffer();
    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    response.send(Buffer.from(out));
  } catch (error) {
    response.status(400).json({ error: error.message || "Couldn't build the spreadsheet" });
  }
});

const saveSchema = z.object({
  fileName: z.string().max(300).optional(),
  // A CSV grid: rows of string cells. Bounded to keep payloads sane.
  rows: z.array(z.array(z.string().max(20_000))).max(50_000).nullable().optional(),
  // Multi-sheet config companions: each stage sheet kept as its own grid.
  sheets: z
    .array(z.object({ name: z.string().max(300), rows: gridSchema }))
    .max(50)
    .nullable()
    .optional(),
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

  saveCompanion(email, parsed.data.fileName ?? "", {
    rows: parsed.data.rows ?? null,
    sheets: parsed.data.sheets ?? null,
  });
  response.json({ ok: true, updatedAt: getCompanion(email)?.updatedAt ?? null });
});

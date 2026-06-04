import ExcelJS from "exceljs";
import { getLlmConfig } from "../config/env.js";
import { OpenAiCompatibleAdapter } from "./llm/openAiCompatibleAdapter.js";

const adapter = new OpenAiCompatibleAdapter(getLlmConfig());

const MAX_SHEETS = 8;
const MAX_COLUMNS = 40;
const MAX_ROWS = 1000;

/** Collect an async token stream into a single trimmed string. */
async function collectStream(messages) {
  let text = "";
  for await (const token of adapter.streamGenerate({ messages })) {
    text += token;
  }
  return text.trim();
}

/** Find the nearest markdown/bold heading above a table to use as its sheet name. */
function nearestHeading(lines, tableIndex) {
  for (let j = tableIndex - 1; j >= 0 && j >= tableIndex - 4; j -= 1) {
    const line = lines[j]?.trim();
    if (!line) continue;
    const match =
      line.match(/^#{1,6}\s*(.+?)\s*$/) ||
      line.match(/^\*\*(.+?)\*\*\s*[:：]?\s*$/) ||
      line.match(/^(.+?)\s*[:：]\s*$/);
    if (match?.[1]) {
      const name = match[1].replace(/[*_`#|]/g, "").replace(/\s+/g, " ").trim();
      if (name && !name.includes("|")) return name.slice(0, 31);
    }
    return null; // nearest non-blank line isn't a heading
  }
  return null;
}

/** Extract any GitHub-flavoured markdown tables from text into sheet objects. */
function extractMarkdownTables(content) {
  const lines = String(content ?? "").split("\n");
  const sheets = [];
  let i = 0;
  const splitRow = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

  while (i < lines.length) {
    const header = lines[i];
    const divider = lines[i + 1];
    const isTableStart =
      header?.includes("|") &&
      divider &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(divider) &&
      divider.includes("-");

    if (!isTableStart) {
      i += 1;
      continue;
    }

    const headerIndex = i;
    const columns = splitRow(header);
    const rows = [];
    i += 2;
    while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
      rows.push(splitRow(lines[i]));
      i += 1;
    }
    // Name the sheet after the nearest preceding heading/bold line, if any.
    const name = nearestHeading(lines, headerIndex) || `Table ${sheets.length + 1}`;
    sheets.push({ name, columns, rows });
  }
  return sheets;
}

/** Ask the model to turn free-form content into a structured workbook (JSON). */
async function generateStructuredData(content) {
  const messages = [
    {
      role: "system",
      content:
        "You convert content into structured spreadsheet data. Respond with ONLY valid JSON " +
        "(no markdown, no code fences) matching this shape: " +
        '{"sheets":[{"name":"string","columns":["string",...],"rows":[["cell",...],...]}]}. ' +
        "Each row's length should match the columns. Pick sensible column headers. " +
        "If the content has no tabular structure, create a reasonable two-column key/value table.",
    },
    {
      role: "user",
      content: `Convert the following into spreadsheet data:\n\n${content}`,
    },
  ];

  const raw = await collectStream(messages);
  // Strip accidental code fences, then grab the outermost JSON object.
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (Array.isArray(parsed?.sheets) && parsed.sheets.length) return parsed.sheets;
  } catch {
    /* fall through */
  }
  return null;
}

/** Normalise/clamp raw sheet objects into safe, bounded data. */
export function sanitizeSheets(sheets) {
  return sheets.slice(0, MAX_SHEETS).map((sheet, index) => {
    const columns = (Array.isArray(sheet.columns) ? sheet.columns : [])
      .slice(0, MAX_COLUMNS)
      .map((c) => String(c ?? ""));
    const rows = (Array.isArray(sheet.rows) ? sheet.rows : [])
      .slice(0, MAX_ROWS)
      .map((row) =>
        (Array.isArray(row) ? row : [row]).slice(0, MAX_COLUMNS).map((c) => String(c ?? "")),
      );
    const name = String(sheet.name || `Sheet ${index + 1}`).slice(0, 31) || `Sheet ${index + 1}`;
    return { name, columns, rows };
  });
}

/**
 * Produce spreadsheet sheet data from free-form content. Tries deterministic
 * markdown-table extraction first (fast, exact), then falls back to an LLM
 * conversion, then to a single text column so it never returns nothing.
 */
export async function buildSheetData(content) {
  const markdownSheets = extractMarkdownTables(content);
  if (markdownSheets.length) return sanitizeSheets(markdownSheets);

  const aiSheets = await generateStructuredData(content).catch(() => null);
  if (aiSheets?.length) return sanitizeSheets(aiSheets);

  const lines = String(content ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_ROWS);
  return [{ name: "Content", columns: ["Content"], rows: lines.map((l) => [l]) }];
}

/** Build an .xlsx file buffer from sheet data, with a styled header row. */
export async function buildXlsxBuffer({ title = "Export", sheets }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OneChat AI Assistant";
  workbook.created = new Date();

  const safeSheets = sheets?.length ? sheets : [{ name: "Sheet1", columns: [], rows: [] }];
  const usedNames = new Set();

  for (const sheet of safeSheets) {
    let name = sheet.name || "Sheet";
    while (usedNames.has(name.toLowerCase())) name = `${name}_`.slice(0, 31);
    usedNames.add(name.toLowerCase());

    const ws = workbook.addWorksheet(name);
    if (sheet.columns.length) {
      const headerRow = ws.addRow(sheet.columns);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE4007C" },
      };
      headerRow.alignment = { vertical: "middle" };
    }
    for (const row of sheet.rows) ws.addRow(row);

    // Auto-size columns to their longest value (bounded).
    const colCount = Math.max(sheet.columns.length, ...sheet.rows.map((r) => r.length), 1);
    for (let c = 1; c <= colCount; c += 1) {
      let width = 10;
      ws.getColumn(c).eachCell({ includeEmpty: false }, (cell) => {
        const len = String(cell.value ?? "").length + 2;
        if (len > width) width = len;
      });
      ws.getColumn(c).width = Math.min(width, 60);
    }
    if (sheet.columns.length) ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Turn a title into a safe file name stem. */
export function safeFileName(title) {
  return (
    String(title || "export")
      .replace(/[^\w.-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "export"
  );
}

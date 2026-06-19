const TEXT_EXTENSIONS = new Set([
  "txt", "csv", "tsv", "md", "markdown", "json", "html", "htm", "log", "xml",
  "yaml", "yml", "ini", "conf", "cfg", "toml", "rtf", "tex",
  "js", "jsx", "ts", "tsx", "css", "scss", "less", "py", "rb", "go", "rs",
  "java", "kt", "c", "h", "cpp", "cs", "php", "sh", "bash", "sql", "ps1",
  "vue", "svelte", "env",
]);
const SHEET_EXTENSIONS = new Set(["xlsx", "xlsm", "xlsb", "xls"]);
const BINARY_EXTENSIONS = new Set(["pdf", "docx"]);

export function getDocumentExtension(name) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

// We no longer hard-reject by extension — every file is accepted and extracted
// best-effort (see extractTextFromBuffer). Kept for callers that still ask.
export function isSupportedDocument() {
  return true;
}

// Does a buffer look like UTF-8 text rather than binary?
function looksLikeText(buffer) {
  const sample = buffer.subarray(0, 2000);
  let bad = 0;
  for (const byte of sample) {
    if (byte === 0 || (byte < 9) || (byte > 13 && byte < 32 && byte !== 27)) bad += 1;
  }
  return sample.length === 0 || bad / sample.length < 0.1;
}

export async function extractTextFromBuffer(name, buffer) {
  const ext = getDocumentExtension(name);

  if (TEXT_EXTENSIONS.has(ext)) {
    return buffer.toString("utf8");
  }

  if (SHEET_EXTENSIONS.has(ext)) {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      const out = [];
      wb.eachSheet((ws) => {
        out.push(`## Sheet: ${ws.name}`);
        ws.eachRow((row) => {
          const values = Array.isArray(row.values) ? row.values.slice(1) : [];
          out.push(values.map((v) => cellText(v)).join(","));
        });
      });
      return out.join("\n");
    } catch (error) {
      throw new Error(`Spreadsheet parsing failed for "${name}" (${error.message})`);
    }
  }

  if (ext === "pdf") {
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const result = await pdfParse(buffer);
      return result.text ?? "";
    } catch (error) {
      throw new Error(`PDF parsing unavailable. Run npm install in server/ (${error.message})`);
    }
  }

  if (ext === "docx") {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? "";
    } catch (error) {
      throw new Error(`Word parsing unavailable. Run npm install in server/ (${error.message})`);
    }
  }

  // Unknown type — read as text if it's readable, otherwise note it's binary.
  if (looksLikeText(buffer)) {
    return buffer.toString("utf8");
  }
  return `[Binary file "${name}" (${ext || "unknown type"}, ${buffer.length} bytes) — contents could not be extracted as text.]`;
}

function cellText(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    if (value.text) return String(value.text);
    if (value.result != null) return String(value.result);
    if (value.richText) return value.richText.map((r) => r.text).join("");
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return "";
  }
  return String(value);
}

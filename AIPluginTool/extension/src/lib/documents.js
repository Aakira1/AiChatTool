// Attachment reader for the side panel (paste / drop / upload). Accepts ANY
// file type: images are downscaled for the vision model, spreadsheets are
// extracted to text in-browser (via the bundled `xlsx`), PDFs/Word are sent as
// base64 for the server to extract, plain-text/code files are read inline, and
// anything else is sent best-effort (text if it's readable, otherwise base64).

const TEXT_EXTENSIONS = [
  "txt", "csv", "tsv", "md", "markdown", "json", "html", "htm", "log", "xml",
  "yaml", "yml", "ini", "conf", "cfg", "toml", "rtf", "tex",
  // common code/config files — treated as plain text
  "js", "jsx", "ts", "tsx", "css", "scss", "less", "py", "rb", "go", "rs",
  "java", "kt", "c", "h", "cpp", "cs", "php", "sh", "bash", "sql", "ps1",
  "vue", "svelte", "env", "gitignore", "dockerfile",
];
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "heic"];
const SHEET_EXTENSIONS = ["xlsx", "xls", "xlsm", "xlsb", "ods", "fods"];
// Binary documents the server text-extracts from base64.
const BINARY_DOC_EXTENSIONS = ["pdf", "docx"];

const MAX_FILES = 3;
// 32 MB — the practical ceiling for a single chat request payload.
const MAX_FILE_BYTES = 32_000_000;
const MAX_TEXT_CHARS = 200_000;
const IMAGE_MAX_SIDE = 1280;

function extOf(file) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

export function isImageFile(file) {
  const type = (file.type || "").toLowerCase();
  // SVG is XML — treat as text, not a raster image for the vision model.
  if (type === "image/svg+xml" || extOf(file) === "svg") return false;
  return type.startsWith("image/") || IMAGE_EXTENSIONS.includes(extOf(file));
}

function readImageDownscaled(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      resolve({ dataUrl, base64: dataUrl.split(",")[1] ?? "", type: "image/jpeg" });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Couldn't read image "${file.name}"`));
    };
    img.src = url;
  });
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") { reject(new Error(`Failed to read ${file.name}`)); return; }
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

// Extract text from a PDF entirely in-browser (pdf.js), so the contents reach
// the model on ANY backend — including the lightweight Worker that can't parse
// binaries. Loaded on demand to keep it out of the main bundle.
async function readPdfAsText(file) {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const out = [];
  const maxPages = Math.min(pdf.numPages, 200);
  for (let p = 1; p <= maxPages; p += 1) {
    const page = await pdf.getPage(p);
    const text = await page.getTextContent();
    const line = text.items.map((it) => it.str).join(" ").replace(/\s+/g, " ").trim();
    if (line) out.push(line);
    if (out.join("\n").length > MAX_TEXT_CHARS) break;
  }
  await pdf.destroy?.();
  return out.join("\n\n").slice(0, MAX_TEXT_CHARS);
}

// Convert a spreadsheet into readable text (one labelled CSV block per sheet).
async function readSpreadsheetAsText(file) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const blocks = wb.SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    return `## Sheet: ${name}\n${csv}`.trim();
  });
  return blocks.join("\n\n").slice(0, MAX_TEXT_CHARS);
}

// Heuristic: does this string look like real text (vs. binary garbage)?
function looksLikeText(s) {
  if (!s) return false;
  const sample = s.slice(0, 2000);
  let bad = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const c = sample.charCodeAt(i);
    if (c === 0 || c === 0xfffd || (c < 32 && c !== 9 && c !== 10 && c !== 13)) bad += 1;
  }
  return bad / sample.length < 0.1;
}

/** Read pasted/dropped/uploaded files into chat-attachment objects (all types). */
export async function readPastedFiles(fileList) {
  const files = [...fileList].slice(0, MAX_FILES);
  const parsed = [];

  for (const [i, file] of files.entries()) {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`"${file.name}" exceeds the 32MB size limit`);
    }
    const ext = extOf(file);

    // 1) Images → downscaled base64 for the vision model.
    if (isImageFile(file)) {
      const fallbackExt = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
      const name =
        file.name && file.name !== "image.png" ? file.name : `pasted-${Date.now()}-${i + 1}.${fallbackExt}`;
      const { dataUrl, base64, type } = await readImageDownscaled(file);
      parsed.push({ name, type, encoding: "base64", content: base64, kind: "image", dataUrl, size: base64.length });
      continue;
    }

    // 2) Spreadsheets → extracted to text in-browser (works on any backend).
    if (SHEET_EXTENSIONS.includes(ext)) {
      try {
        const content = await readSpreadsheetAsText(file);
        if (content.trim()) {
          parsed.push({ name: file.name, type: file.type || "text/csv", content, size: content.length });
          continue;
        }
      } catch { /* fall through to base64 */ }
    }

    // 3a) PDF → extracted to text in-browser so it works on any backend.
    if (ext === "pdf") {
      try {
        const content = await readPdfAsText(file);
        if (content.trim()) {
          parsed.push({ name: file.name, type: "text/plain", content, size: content.length });
          continue;
        }
      } catch { /* fall through to base64 (scanned PDF / parse failure) */ }
    }

    // 3b) Word (and PDFs that yielded no text) → base64; the server extracts.
    if (BINARY_DOC_EXTENSIONS.includes(ext)) {
      const content = await readAsBase64(file);
      parsed.push({ name: file.name, type: file.type || "application/octet-stream", encoding: "base64", content, size: file.size });
      continue;
    }

    // 4) Known text/code → inline.
    if (TEXT_EXTENSIONS.includes(ext)) {
      const content = (await file.text()).slice(0, MAX_TEXT_CHARS);
      if (!content.trim()) throw new Error(`"${file.name}" is empty`);
      parsed.push({ name: file.name, type: file.type || "text/plain", content, size: content.length });
      continue;
    }

    // 5) Unknown type → sniff: inline if it reads as text, else send base64.
    let text = "";
    try { text = (await file.text()).slice(0, MAX_TEXT_CHARS); } catch { /* binary */ }
    if (text && looksLikeText(text)) {
      parsed.push({ name: file.name, type: file.type || "text/plain", content: text, size: text.length });
    } else {
      const content = await readAsBase64(file);
      parsed.push({ name: file.name, type: file.type || "application/octet-stream", encoding: "base64", content, size: file.size });
    }
  }

  return parsed;
}

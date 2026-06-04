// Detects fenced ```spreadsheet / ```xlsx blocks emitted by the assistant and
// turns them into downloadable-file specs. Returns the cleaned text (block
// removed), the parsed file specs, and a `pending` flag for a block that is
// still streaming in (unterminated fence) so the UI can show a placeholder
// instead of raw JSON.

const FENCE_RE = /```(?:spreadsheet|xlsx)\s*\n([\s\S]*?)```/gi;
// An opening fence with no closing fence yet (still streaming).
const OPEN_FENCE_RE = /```(?:spreadsheet|xlsx)\s*\n([\s\S]*)$/i;
// Document fences: ```document [info] \n <markdown> ``` (info may carry format/title).
const DOC_FENCE_RE = /```document([^\n]*)\n([\s\S]*?)```/gi;
const DOC_OPEN_RE = /```document([^\n]*)\n([\s\S]*)$/i;

const VALID_FORMATS = ["docx", "pdf"];

function parseDocInfo(info) {
  // Drop any markdown emphasis the model wrapped the marker in (**, *, _, `, #).
  const text = String(info ?? "").replace(/[*_`#]/g, "");
  const formats = VALID_FORMATS.filter((f) => new RegExp(`\\b${f}\\b`, "i").test(text));
  const titleMatch = text.match(/title\s*[:=]\s*["']?([^"',]+)["']?/i);
  return {
    formats: formats.length ? formats : ["docx", "pdf"],
    title: titleMatch?.[1]?.trim() || "",
  };
}

function coerceSpec(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const sheets = Array.isArray(parsed.sheets) ? parsed.sheets : null;
  if (!sheets || !sheets.length) return null;
  return {
    title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "Export",
    sheets,
  };
}

// True when text contains a GitHub-flavoured markdown table (header row + a
// |---|---| divider row). Used as a fallback when the model describes a
// spreadsheet in prose/tables instead of emitting a ```spreadsheet JSON block.
export function hasMarkdownTable(text) {
  const lines = String(text ?? "").split("\n");
  for (let i = 0; i < lines.length - 1; i += 1) {
    const header = lines[i];
    const divider = lines[i + 1];
    if (
      header?.includes("|") &&
      divider &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(divider) &&
      divider.includes("-")
    ) {
      return true;
    }
  }
  return false;
}

// True when the text looks like a fillable form: explicit ```form block, blank
// "Label:" lines, underscore blanks, or [ ] checkboxes.
export function hasFormFields(text) {
  const source = String(text ?? "");
  if (/```form\s*\n/i.test(source)) return true;
  return source.split("\n").some((raw) => {
    const line = raw.trim();
    return (
      /^(?:[-*]\s*)?\[\s?\]\s+\S/.test(line) ||
      /_{3,}\s*$/.test(line) ||
      /^[A-Za-z][^:]{0,58}:\s*$/.test(line)
    );
  });
}

// Best-effort title for a generated spreadsheet, derived from the assistant's
// own wording so the file name matches what it called the sheet. Looks for an
// explicit "Title: X" line, then a leading markdown/bold heading, else falls
// back to a sensible default.
export function deriveFileTitle(content, fallback = "Spreadsheet") {
  const text = String(content ?? "");

  const titleLine = text.match(/^\s*\**title\**\s*[:：]\s*(.+?)\s*$/im);
  if (titleLine?.[1]) return cleanTitle(titleLine[1]) || fallback;

  const heading = text.match(/^\s*#{1,6}\s*(.+?)\s*$/m);
  if (heading?.[1]) return cleanTitle(heading[1]) || fallback;

  const bold = text.match(/^\s*\*\*(.+?)\*\*\s*$/m);
  if (bold?.[1]) return cleanTitle(bold[1]) || fallback;

  return fallback;
}

function cleanTitle(value) {
  return String(value)
    .replace(/[*_`#|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function parseFileBlocks(content) {
  const source = String(content ?? "");
  const files = [];

  // Replace each complete spreadsheet block with nothing.
  let text = source.replace(FENCE_RE, (match, body) => {
    const spec = coerceSpec(body);
    if (spec) {
      files.push(spec);
      return "";
    }
    // Invalid JSON in a closed block — leave it untouched so nothing is lost.
    return match;
  });

  // Replace each complete document block: keep the markdown body visible (so the
  // user reads the document) and attach a download card for the requested format(s).
  text = text.replace(DOC_FENCE_RE, (_match, info, body) => {
    const { formats, title } = parseDocInfo(info);
    const docBody = String(body).trim();
    files.push({
      kind: "document",
      title: title || deriveFileTitle(docBody, "Document"),
      content: docBody,
      formats,
    });
    return `\n\n${docBody}\n\n`;
  });

  // Fallback: the model often emits the `document format=… title=…` marker line
  // WITHOUT the surrounding ``` fence. Detect a bare marker line (anywhere) that
  // carries a format/title hint and treat everything after it as the document body.
  if (!files.some((f) => f.kind === "document")) {
    // Tolerate leading/trailing markdown emphasis or fences around the marker,
    // e.g. **document format=docx,pdf title=…** or ```document …```.
    const loose = text.match(
      /(^|\n)[ \t]*[*_`#>\s]{0,6}document\b[ \t]*([^\n]*)\n([\s\S]*)$/i,
    );
    if (loose && /\b(format|title)\b/i.test(loose[2])) {
      const { formats, title } = parseDocInfo(loose[2]);
      const body = loose[3].replace(/```+\s*$/, "").trim();
      if (body) {
        files.push({
          kind: "document",
          title: title || deriveFileTitle(body, "Document"),
          content: body,
          formats,
        });
        const before = text.slice(0, loose.index).trim();
        text = `${before ? `${before}\n\n` : ""}${body}`;
      }
    }
  }

  // After removing complete blocks, check for a trailing unterminated block.
  let pending = false;
  const open = text.match(OPEN_FENCE_RE) || text.match(DOC_OPEN_RE);
  if (open) {
    pending = true;
    text = text.slice(0, open.index);
  }

  return { text: text.trim(), files, pending };
}

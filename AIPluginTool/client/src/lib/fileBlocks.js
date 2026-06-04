// Detects fenced ```spreadsheet / ```xlsx blocks emitted by the assistant and
// turns them into downloadable-file specs. Returns the cleaned text (block
// removed), the parsed file specs, and a `pending` flag for a block that is
// still streaming in (unterminated fence) so the UI can show a placeholder
// instead of raw JSON.

const FENCE_RE = /```(?:spreadsheet|xlsx)\s*\n([\s\S]*?)```/gi;
// An opening fence with no closing fence yet (still streaming).
const OPEN_FENCE_RE = /```(?:spreadsheet|xlsx)\s*\n([\s\S]*)$/i;

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

  // Replace each complete block with nothing (collapsing surrounding blank space).
  let text = source.replace(FENCE_RE, (match, body) => {
    const spec = coerceSpec(body);
    if (spec) {
      files.push(spec);
      return "";
    }
    // Invalid JSON in a closed block — leave it untouched so nothing is lost.
    return match;
  });

  // After removing complete blocks, check for a trailing unterminated block.
  let pending = false;
  const open = text.match(OPEN_FENCE_RE);
  if (open) {
    pending = true;
    text = text.slice(0, open.index);
  }

  return { text: text.trim(), files, pending };
}

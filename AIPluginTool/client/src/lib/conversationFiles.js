import { parseFileBlocks, hasMarkdownTable, deriveFileTitle } from "./fileBlocks.js";

// Walk a conversation's messages and collect every downloadable file the
// assistant produced — explicit spreadsheet/document specs from markers, plus a
// fallback spreadsheet for any reply that contains a markdown table. Each entry
// is a FileDownloadCard-compatible spec annotated with its source message.
export function collectConversationFiles(messages = []) {
  const out = [];
  const seen = new Set();

  for (const message of messages) {
    if (message.role !== "assistant" || !message.content || message.id === "welcome") {
      continue;
    }

    const { files } = parseFileBlocks(message.content);
    const specs = [...files];

    // Fallback: a reply with a table but no explicit spec still yields a sheet.
    if (!files.length && hasMarkdownTable(message.content)) {
      specs.push({ title: deriveFileTitle(message.content), content: message.content });
    }

    specs.forEach((spec, index) => {
      const kind = spec.kind === "document" ? "document" : "spreadsheet";
      const title = spec.title || (kind === "document" ? "Document" : "Spreadsheet");
      const key = `${kind}:${title}:${(spec.content ?? JSON.stringify(spec.sheets ?? "")).slice(0, 120)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ ...spec, messageId: message.id, index });
    });
  }

  return out;
}

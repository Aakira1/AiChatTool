import {
  extractTextFromBuffer,
  getDocumentExtension,
  isSupportedDocument,
} from "./binaryDocument.js";

const MAX_ATTACHMENTS = 3;
const MAX_FILE_CHARS = 200_000;
const MAX_TOTAL_CHARS = 500_000;
const MAX_BASE64_BYTES = 10_000_000;
const MAX_IMAGE_BYTES = 8_000_000;

function isImageAttachment(item) {
  const type = String(item?.type ?? "").toLowerCase();
  const name = String(item?.name ?? "").toLowerCase();
  return type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/.test(name);
}

export async function sanitizeAttachments(rawAttachments = []) {
  if (!Array.isArray(rawAttachments) || rawAttachments.length === 0) {
    return [];
  }

  const sanitized = [];
  let totalChars = 0;

  for (const item of rawAttachments.slice(0, MAX_ATTACHMENTS)) {
    const name = String(item?.name ?? "document").slice(0, 200);

    // Images are kept as base64 for the vision model (not text-extracted).
    if (isImageAttachment(item)) {
      const data = String(item?.content ?? "");
      const bytes = Buffer.from(data, "base64").length;
      if (bytes > MAX_IMAGE_BYTES) {
        throw new Error(`"${name}" exceeds the 8MB image size limit`);
      }
      sanitized.push({
        name,
        type: String(item?.type ?? "image/png").slice(0, 100),
        isImage: true,
        data,
        content: "",
        size: bytes,
      });
      continue;
    }

    if (!isSupportedDocument(name)) {
      throw new Error(
        `Unsupported file type: ${name}. Use .txt, .csv, .md, .json, .pdf, or .docx`,
      );
    }

    let content = "";
    const encoding = item?.encoding;

    if (encoding === "base64") {
      const base64 = String(item?.content ?? "");
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length > MAX_BASE64_BYTES) {
        throw new Error(`"${name}" exceeds the 10MB binary size limit`);
      }
      content = (await extractTextFromBuffer(name, buffer)).slice(0, MAX_FILE_CHARS);
    } else {
      content = String(item?.content ?? "").slice(0, MAX_FILE_CHARS);
    }

    if (!content.trim()) {
      throw new Error(`Attachment "${name}" is empty or could not be parsed`);
    }

    if (totalChars + content.length > MAX_TOTAL_CHARS) {
      throw new Error("Total attachment text exceeds the 500K character limit");
    }

    totalChars += content.length;
    const ext = getDocumentExtension(name);
    sanitized.push({
      name,
      type: String(item?.type ?? mimeForExtension(ext)).slice(0, 100),
      content,
      size: content.length,
    });
  }

  return sanitized;
}

function mimeForExtension(ext) {
  const map = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    csv: "text/csv",
    md: "text/markdown",
    json: "application/json",
  };
  return map[ext] ?? "text/plain";
}

export function buildAttachmentContext(attachments = []) {
  const docs = attachments.filter((a) => !a.isImage);
  if (!docs.length) {
    return "";
  }

  return docs
    .map(
      (file, index) =>
        `### Attached document ${index + 1}: ${file.name}\n` +
        `Type: ${file.type}\n` +
        `Content:\n${file.content}`,
    )
    .join("\n\n");
}

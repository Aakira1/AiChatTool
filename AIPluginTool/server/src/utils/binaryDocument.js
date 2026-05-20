const TEXT_EXTENSIONS = new Set(["txt", "csv", "md", "json", "html", "htm", "log", "xml"]);
const BINARY_EXTENSIONS = new Set(["pdf", "docx"]);

export function getDocumentExtension(name) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function isSupportedDocument(name) {
  const ext = getDocumentExtension(name);
  return TEXT_EXTENSIONS.has(ext) || BINARY_EXTENSIONS.has(ext);
}

export async function extractTextFromBuffer(name, buffer) {
  const ext = getDocumentExtension(name);

  if (TEXT_EXTENSIONS.has(ext)) {
    return buffer.toString("utf8");
  }

  if (ext === "pdf") {
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const result = await pdfParse(buffer);
      return result.text ?? "";
    } catch (error) {
      throw new Error(
        `PDF parsing unavailable. Run npm install in server/ (${error.message})`,
      );
    }
  }

  if (ext === "docx") {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? "";
    } catch (error) {
      throw new Error(
        `Word parsing unavailable. Run npm install in server/ (${error.message})`,
      );
    }
  }

  throw new Error(`Unsupported file type: .${ext}`);
}

const TEXT_EXTENSIONS = ["txt", "csv", "md", "json", "html", "htm", "log", "xml"];
const BINARY_EXTENSIONS = ["pdf", "docx"];
const MAX_FILES = 3;
const MAX_FILE_BYTES = 10_000_000;
const MAX_TEXT_CHARS = 200_000;

export function isAllowedDocument(file) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.includes(ext) || BINARY_EXTENSIONS.includes(ext);
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file"));
        return;
      }
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/**
 * @param {FileList | File[]} fileList
 */
export async function readDocumentFiles(fileList) {
  const files = [...fileList];
  if (files.length > MAX_FILES) {
    throw new Error(`You can attach up to ${MAX_FILES} documents at a time`);
  }

  const parsed = [];

  for (const file of files) {
    if (!isAllowedDocument(file)) {
      throw new Error(
        `"${file.name}" is not supported. Use .txt, .csv, .md, .json, .pdf, or .docx.`,
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`"${file.name}" exceeds the 10MB size limit`);
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

    if (BINARY_EXTENSIONS.includes(ext)) {
      const content = await readAsBase64(file);
      parsed.push({
        name: file.name,
        type: file.type || "application/octet-stream",
        encoding: "base64",
        content,
        size: file.size,
      });
      continue;
    }

    const content = (await file.text()).slice(0, MAX_TEXT_CHARS);
    if (!content.trim()) {
      throw new Error(`"${file.name}" is empty`);
    }

    parsed.push({
      name: file.name,
      type: file.type || "text/plain",
      content,
      size: content.length,
    });
  }

  return parsed;
}

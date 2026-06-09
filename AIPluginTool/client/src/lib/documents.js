const TEXT_EXTENSIONS = ["txt", "csv", "md", "json", "html", "htm", "log", "xml"];
const BINARY_EXTENSIONS = ["pdf", "docx"];
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
const MAX_FILES = 3;
const MAX_FILE_BYTES = 10_000_000;
const MAX_TEXT_CHARS = 200_000;
const IMAGE_MAX_SIDE = 1280; // downscale longest side so it fits the vision model

function extOf(file) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}
export function isImageFile(file) {
  return (file.type || "").startsWith("image/") || IMAGE_EXTENSIONS.includes(extOf(file));
}

export function isAllowedDocument(file) {
  const ext = extOf(file);
  return TEXT_EXTENSIONS.includes(ext) || BINARY_EXTENSIONS.includes(ext) || isImageFile(file);
}

// Downscale + re-encode an image so it's small enough for the vision model and
// returns its base64 (no data-url prefix) plus a data-url for preview.
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
        `"${file.name}" is not supported. Use an image (PNG/JPG) or .txt, .csv, .md, .json, .pdf, .docx.`,
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`"${file.name}" exceeds the 10MB size limit`);
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

    if (isImageFile(file)) {
      const { dataUrl, base64, type } = await readImageDownscaled(file);
      parsed.push({
        name: file.name,
        type,
        encoding: "base64",
        content: base64,
        kind: "image",
        dataUrl,
        size: base64.length,
      });
      continue;
    }

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

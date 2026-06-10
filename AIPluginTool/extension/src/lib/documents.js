// Minimal attachment reader for the side panel (paste / drop). Mirrors the web
// client's documents.js: images are downscaled + re-encoded so they fit the
// vision model; small text files are read inline.

const TEXT_EXTENSIONS = ["txt", "csv", "md", "json", "html", "htm", "log", "xml"];
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
const MAX_FILES = 3;
const MAX_FILE_BYTES = 10_000_000;
const MAX_TEXT_CHARS = 200_000;
const IMAGE_MAX_SIDE = 1280;

function extOf(file) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

export function isImageFile(file) {
  return (file.type || "").startsWith("image/") || IMAGE_EXTENSIONS.includes(extOf(file));
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

/** Read pasted/dropped files into chat-attachment objects. */
export async function readPastedFiles(fileList) {
  const files = [...fileList].slice(0, MAX_FILES);
  const parsed = [];
  for (const [i, file] of files.entries()) {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`"${file.name}" exceeds the 10MB size limit`);
    }
    if (isImageFile(file)) {
      const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
      const name =
        file.name && file.name !== "image.png" ? file.name : `pasted-${Date.now()}-${i + 1}.${ext}`;
      const { dataUrl, base64, type } = await readImageDownscaled(file);
      parsed.push({
        name,
        type,
        encoding: "base64",
        content: base64,
        kind: "image",
        dataUrl,
        size: base64.length,
      });
      continue;
    }
    if (TEXT_EXTENSIONS.includes(extOf(file))) {
      const content = (await file.text()).slice(0, MAX_TEXT_CHARS);
      if (!content.trim()) throw new Error(`"${file.name}" is empty`);
      parsed.push({ name: file.name, type: file.type || "text/plain", content, size: content.length });
      continue;
    }
    throw new Error(`"${file.name}" isn't supported here — paste an image or a text file.`);
  }
  return parsed;
}

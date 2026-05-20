const DEFAULT_CHUNK_SIZE = 1400;
const DEFAULT_OVERLAP = 200;

export function chunkText(text, { chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP } = {}) {
  const normalized = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!normalized) {
    return [];
  }

  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    chunks.push(normalized.slice(start, end));
    if (end >= normalized.length) {
      break;
    }
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

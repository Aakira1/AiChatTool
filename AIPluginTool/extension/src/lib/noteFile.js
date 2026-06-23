// Portable note files: a note is saved as a small self-contained .note.html file
// (downloaded to the user's Downloads/Desktop) that can later be dragged back
// into the Notepad to recreate the note with its formatting intact. Plain
// .html/.md/.txt/.json files are also accepted on import.
import { mdToHtml } from "./markdown.js";

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeFileName(name) {
  return (name || "note").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "note";
}

export function noteFileHtml(title, contentHtml) {
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
    `<meta name="onechat-note" content="1"></head>` +
    `<body data-onechat-note="1">${contentHtml || "<p><br></p>"}</body></html>`
  );
}

/** Download a note as a re-importable .note.html file. */
export function downloadNoteFile(title, contentHtml) {
  const blob = new Blob([noteFileHtml(title, contentHtml)], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFileName(title)}.note.html`;
  a.click();
  URL.revokeObjectURL(url);
}

/** True if a dropped file looks like an importable note. */
export function isNoteFile(name) {
  return /\.(html?|md|markdown|txt|json)$/i.test(name || "");
}

/** Parse a dropped file's text back into { title, content(html) }. */
export function parseNoteFile(fileName, text) {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  const base = fileName.replace(/\.(note\.)?(html?|md|markdown|txt|json)$/i, "") || "Imported note";

  if (ext === "json") {
    try {
      const j = JSON.parse(text);
      const content = j?.content || j?.html;
      if (content) return { title: j.title || base, content };
    } catch { /* fall through */ }
  }

  if (ext === "html" || ext === "htm") {
    try {
      const doc = new DOMParser().parseFromString(text, "text/html");
      const title = doc.querySelector("title")?.textContent?.trim() || base;
      const content = doc.body ? doc.body.innerHTML.trim() : text;
      return { title, content: content || "<p><br></p>" };
    } catch { /* fall through */ }
  }

  if (ext === "md" || ext === "markdown") {
    return { title: base, content: mdToHtml(text) };
  }

  // Plain text / unknown → paragraphs.
  const content = text
    .split(/\n\n+/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return { title: base, content: content || "<p><br></p>" };
}

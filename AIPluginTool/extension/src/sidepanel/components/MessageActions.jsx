import { useState } from "react";
import { getNotepad, saveNotepad } from "../../lib/storage.js";
import { mdToHtml } from "../../lib/markdown.js";
import { downloadNoteFile } from "../../lib/noteFile.js";

// Simple line icons (Feather-style) for the message action row.
function Icon({ name }) {
  const p = {
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    check: <path d="M20 6 9 17l-5-5" />,
    regen: <><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></>,
    up: <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />,
    down: <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />,
    notes: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h4" /></>,
  }[name];
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {p}
    </svg>
  );
}

// Per-message action row for assistant replies — icon-only: Copy, Regenerate
// (last reply), 👍/👎 feedback, and Post to notes.
export function MessageActions({ message, isLastAssistant, pending, onRegenerate, onRate }) {
  const [copied, setCopied] = useState(false);
  const [posted, setPosted] = useState(false);
  const feedback = message.metadata?.feedback;

  const handleCopy = async () => {
    const text = message.content ?? "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for contexts where the async clipboard API is blocked.
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px;top:0;";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      } catch { /* give up silently */ }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const handlePostToNotes = async () => {
    const md = message.content ?? "";
    if (!md.trim()) return;
    const data = (await getNotepad()) || { notes: [], folders: [] };
    const notes = Array.isArray(data.notes) ? data.notes : [];
    const firstLine =
      md.split("\n").map((s) => s.replace(/[#*`>_\-|]/g, "").trim()).find(Boolean) || "Saved from chat";
    const title = firstLine.slice(0, 40);
    const html = mdToHtml(md);
    notes.push({
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      content: html,
      updatedAt: new Date().toISOString(),
      fromSchedule: false,
      folderId: null,
    });
    await saveNotepad({ notes, folders: data.folders ?? [] });
    // Also save a re-importable file to disk (drag it back into the Notepad later).
    downloadNoteFile(title, html);
    setPosted(true);
    setTimeout(() => setPosted(false), 1500);
  };

  return (
    <div className="cia-ext-msg-actions">
      <button type="button" onClick={handleCopy} disabled={pending} title={copied ? "Copied" : "Copy"} aria-label="Copy">
        <Icon name={copied ? "check" : "copy"} />
      </button>
      {isLastAssistant ? (
        <button type="button" onClick={onRegenerate} disabled={pending} title="Regenerate" aria-label="Regenerate">
          <Icon name="regen" />
        </button>
      ) : null}
      <button
        type="button"
        className={feedback === "up" ? "is-active" : ""}
        onClick={() => onRate?.(message.id, "up")}
        disabled={pending}
        title="Helpful"
        aria-label="Helpful"
      >
        <Icon name="up" />
      </button>
      <button
        type="button"
        className={feedback === "down" ? "is-active" : ""}
        onClick={() => onRate?.(message.id, "down")}
        disabled={pending}
        title="Not helpful"
        aria-label="Not helpful"
      >
        <Icon name="down" />
      </button>
      <button
        type="button"
        className={posted ? "is-active" : ""}
        onClick={() => void handlePostToNotes()}
        disabled={pending}
        title={posted ? "Saved to notes" : "Post to notes"}
        aria-label="Post to notes"
      >
        <Icon name={posted ? "check" : "notes"} />
      </button>
    </div>
  );
}

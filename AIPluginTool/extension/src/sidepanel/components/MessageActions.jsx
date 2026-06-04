import { useState } from "react";

// Per-message action row for assistant replies, mirroring the web app:
// Copy, Regenerate (last only), 👍/👎 feedback, and Post to forum.
export function MessageActions({
  message,
  isLastAssistant,
  pending,
  onCopy,
  onRegenerate,
  onRate,
  onPostToForum,
}) {
  const [copied, setCopied] = useState(false);
  const feedback = message.metadata?.feedback;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
    onCopy?.(message.content);
  };

  return (
    <div className="cia-ext-msg-actions">
      <button type="button" onClick={handleCopy} disabled={pending}>
        {copied ? "Copied" : "Copy"}
      </button>
      {isLastAssistant ? (
        <button type="button" onClick={onRegenerate} disabled={pending}>
          Regenerate
        </button>
      ) : null}
      <button
        type="button"
        className={feedback === "up" ? "is-active" : ""}
        onClick={() => onRate?.(message.id, "up")}
        disabled={pending}
        aria-label="Helpful"
      >
        👍
      </button>
      <button
        type="button"
        className={feedback === "down" ? "is-active" : ""}
        onClick={() => onRate?.(message.id, "down")}
        disabled={pending}
        aria-label="Not helpful"
      >
        👎
      </button>
      {onPostToForum ? (
        <button type="button" onClick={() => onPostToForum(message)} disabled={pending}>
          Post to forum
        </button>
      ) : null}
    </div>
  );
}

export function MessageActions({
  message,
  isLastAssistant,
  isLastUser,
  pending,
  onCopy,
  onRegenerate,
  onEdit,
  onRate,
  onPostToForum,
}) {
  if (message.id === "welcome" || message.id?.startsWith("local-")) {
    return null;
  }

  return (
    <div className="cia-message-actions">
      {message.role === "assistant" ? (
        <>
          <button type="button" onClick={() => onCopy?.(message.content)} disabled={pending}>
            Copy
          </button>
          {isLastAssistant ? (
            <button type="button" onClick={onRegenerate} disabled={pending}>
              Regenerate
            </button>
          ) : null}
          <button
            type="button"
            className={message.metadata?.feedback === "up" ? "active" : ""}
            onClick={() => onRate?.(message.id, "up")}
            disabled={pending}
          >
            👍
          </button>
          <button
            type="button"
            className={message.metadata?.feedback === "down" ? "active" : ""}
            onClick={() => onRate?.(message.id, "down")}
            disabled={pending}
          >
            👎
          </button>
          {onPostToForum ? (
            <button type="button" onClick={() => onPostToForum(message)} disabled={pending}>
              Post to forum
            </button>
          ) : null}
        </>
      ) : null}
      {message.role === "user" && isLastUser ? (
        <button type="button" onClick={() => onEdit?.(message)} disabled={pending}>
          Edit
        </button>
      ) : null}
    </div>
  );
}

function shortHost(url) {
  try {
    const parsed = new URL(url);
    return parsed.host.replace(/^www\./, "");
  } catch {
    return url || "Current page";
  }
}

export function PageContextChip({ context, included, onToggle, onRefresh }) {
  if (!context) {
    return null;
  }
  const restricted = context.restricted;
  const host = shortHost(context.url);
  const hasSelection = (context.selection ?? "").length > 0;

  return (
    <div className={`cia-ext-context ${included && !restricted ? "is-on" : "is-off"}`}>
      <button
        type="button"
        className="cia-ext-context-toggle"
        onClick={onToggle}
        disabled={restricted}
        title={restricted ? "Page context isn't available on this URL" : "Toggle page context"}
      >
        <span className="cia-ext-context-icon" aria-hidden="true">
          {included && !restricted ? "✓" : restricted ? "🚫" : "○"}
        </span>
        <span className="cia-ext-context-text">
          <strong>{restricted ? "No page context" : included ? "Including page context" : "Page context off"}</strong>
          <span className="cia-ext-context-meta">
            {restricted
              ? "Browser restricts this URL"
              : `${host}${hasSelection ? " · selected text" : ""}`}
          </span>
        </span>
      </button>
      <button
        type="button"
        className="cia-ext-context-refresh"
        onClick={onRefresh}
        title="Refresh page context"
        aria-label="Refresh page context"
      >
        ↻
      </button>
    </div>
  );
}

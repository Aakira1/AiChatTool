import { useEffect, useRef } from "react";

function shortHost(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url || "Current page";
  }
}

export function PageContextPopup({
  context,
  included,
  capturing,
  onToggle,
  onRefresh,
  onCapture,
  onClearScreenshot,
  onClose,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const restricted = context?.restricted;
  const host = context ? shortHost(context.url) : "";
  const hasSelection = (context?.selection ?? "").length > 0;
  const hasScreenshot = Boolean(context?.screenshot);
  const hasExcerpt = (context?.excerpt ?? "").length > 0;

  return (
    <div className="cia-ext-picker-panel cia-ext-ctx-panel" ref={panelRef}>
      <div className="cia-ext-picker-header">Page context</div>

      <div className="cia-ext-sources-row">
        <span className="cia-ext-sources-icon">{restricted ? "🚫" : "🌐"}</span>
        <span className="cia-ext-sources-label">
          {restricted ? "Not available on this URL" : "Include this page"}
        </span>
        <button
          type="button"
          className={`cia-ext-toggle ${included && !restricted ? "is-on" : ""}`}
          onClick={onToggle}
          disabled={restricted}
          aria-label="Toggle page context"
        >
          <span className="cia-ext-toggle-thumb" />
        </button>
      </div>

      {!restricted && (
        <div className="cia-ext-ctx-meta">
          {[
            host,
            hasSelection ? "selected text" : null,
            hasExcerpt ? "page text" : null,
            hasScreenshot ? "screenshot" : null,
          ]
            .filter(Boolean)
            .join(" · ") || "No content captured yet"}
        </div>
      )}

      <div className="cia-ext-ctx-actions">
        <button
          type="button"
          className={`cia-ext-secondary-btn cia-ext-ctx-btn ${hasScreenshot ? "has-shot" : ""}`}
          onClick={onCapture}
          disabled={restricted || capturing}
        >
          {capturing ? "Capturing…" : hasScreenshot ? "👁 Re-capture" : "👁 Capture view"}
        </button>
        <button
          type="button"
          className="cia-ext-secondary-btn cia-ext-ctx-btn"
          onClick={onRefresh}
          disabled={restricted}
        >
          ↻ Refresh
        </button>
      </div>

      {context?.captureError ? (
        <p className="cia-ext-context-error" role="alert">{context.captureError}</p>
      ) : null}

      {hasScreenshot ? (
        <div className="cia-ext-screenshot-preview">
          <img src={context.screenshot} alt="Captured view of the current tab" />
          <div className="cia-ext-screenshot-actions">
            <span>Attached to next message</span>
            <button type="button" onClick={onClearScreenshot}>Remove</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

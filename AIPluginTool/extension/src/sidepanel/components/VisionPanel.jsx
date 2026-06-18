import { useEffect, useRef } from "react";

// AI Vision popover — lets the assistant read the current page and "see" it via
// a screenshot. Styled to match the Sources popover.
export function VisionPanel({
  pageContext,
  includeContext,
  onToggleContext,
  wholePageVision,
  onToggleWholePageVision,
  capturing,
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

  const restricted = pageContext?.restricted;
  const hasShot = Boolean(pageContext?.screenshot);

  return (
    <div className="cia-ext-sources-panel" ref={panelRef}>
      <div className="cia-ext-sources-header">AI Vision</div>

      <div className="cia-ext-sources-row">
        <span className="cia-ext-sources-icon">📄</span>
        <span className="cia-ext-sources-label">Read this page</span>
        <button
          type="button"
          className={`cia-ext-toggle ${includeContext && !restricted ? "is-on" : ""}`}
          onClick={onToggleContext}
          disabled={restricted}
          aria-label="Toggle read this page"
        >
          <span className="cia-ext-toggle-thumb" />
        </button>
      </div>

      <div className="cia-ext-sources-row">
        <span className="cia-ext-sources-icon">🖼️</span>
        <span className="cia-ext-sources-label">See the whole page</span>
        <button
          type="button"
          className={`cia-ext-toggle ${wholePageVision ? "is-on" : ""}`}
          onClick={onToggleWholePageVision}
          aria-label="Toggle whole-page vision"
        >
          <span className="cia-ext-toggle-thumb" />
        </button>
      </div>

      <button
        type="button"
        className="cia-ext-vision-capture"
        onClick={onCapture}
        disabled={capturing || restricted}
      >
        {capturing ? "📸 Capturing…" : hasShot ? "📸 Recapture screenshot" : "📸 Capture screenshot"}
      </button>

      {hasShot ? (
        <div className="cia-ext-vision-shot">
          <img src={pageContext.screenshot} alt="Captured page" />
          <button type="button" className="cia-ext-vision-shot-clear" onClick={onClearScreenshot} aria-label="Remove screenshot">
            ×
          </button>
        </div>
      ) : null}

      <p className="cia-ext-vision-hint">
        {restricted
          ? "This page can't be read by extensions (chrome:// or store pages)."
          : "Lets the assistant use the current tab's text and a screenshot to answer about what you're viewing."}
      </p>
    </div>
  );
}

export function Banner({ tone = "info", message, onDismiss }) {
  if (!message) return null;
  return (
    <div className={`cia-ext-banner cia-ext-banner-${tone}`} role="status">
      <span>{message}</span>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="cia-ext-banner-dismiss">
          ×
        </button>
      ) : null}
    </div>
  );
}

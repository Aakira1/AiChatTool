import { openWebApp } from "../../lib/storage.js";

export function TopBar({ healthState, user, onLogout, onOpenOptions, compact = false }) {
  const status = healthState?.ok === true ? "online" : healthState?.ok === false ? "offline" : "unknown";
  const statusLabel =
    status === "online" ? "Connected" : status === "offline" ? "Offline" : "Checking…";

  return (
    <header className="cia-ext-topbar">
      <div className="cia-ext-brand">
        <div className="cia-ext-logo" aria-hidden="true">
          T1
        </div>
        <div className="cia-ext-brand-text">
          <strong>OneChat Assistant</strong>
          <span className={`cia-ext-status cia-ext-status-${status}`}>
            <span className="cia-ext-status-dot" /> {statusLabel}
          </span>
        </div>
      </div>

      {!compact ? (
        <div className="cia-ext-topbar-actions">
          {user?.email ? (
            <span className="cia-ext-user" title={user.email}>
              {user.email}
            </span>
          ) : null}
          <button
            type="button"
            className="cia-ext-icon-btn"
            onClick={() => void openWebApp()}
            title="Open the full web app"
            aria-label="Open the full web app"
          >
            ↗
          </button>
          <button type="button" className="cia-ext-icon-btn" onClick={onOpenOptions} title="Settings">
            ⚙
          </button>
          <button type="button" className="cia-ext-icon-btn" onClick={onLogout} title="Sign out">
            ⎋
          </button>
        </div>
      ) : (
        <div className="cia-ext-topbar-actions">
          <button
            type="button"
            className="cia-ext-icon-btn"
            onClick={() => void openWebApp()}
            title="Open the full web app"
            aria-label="Open the full web app"
          >
            ↗
          </button>
          <button type="button" className="cia-ext-icon-btn" onClick={onOpenOptions} title="Settings">
            ⚙
          </button>
        </div>
      )}
    </header>
  );
}

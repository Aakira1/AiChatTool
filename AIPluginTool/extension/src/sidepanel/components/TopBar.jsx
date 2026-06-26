import { useRef, useState } from "react";
import { PortalPopover } from "./PortalPopover.jsx";

function closeSidePanel() {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "CIA_PANEL_CLOSE" }, "*");
      return;
    }
  } catch { /* ignore */ }
  window.close();
}

function AppLauncher({ items }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);

  if (!items.length) return null;

  return (
    <div className="cia-ext-launcher">
      <button
        ref={btnRef}
        type="button"
        className={`cia-ext-icon-btn${open ? " is-active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title="Apps"
        aria-label="Apps"
        aria-expanded={open}
      >
        <span className="cia-ext-launcher-grid" aria-hidden="true">
          <i /><i /><i />
          <i /><i /><i />
          <i /><i /><i />
        </span>
      </button>
      <PortalPopover
        anchorRef={btnRef}
        open={open}
        placement="below"
        align="end"
        onClose={() => setOpen(false)}
      >
        <div className="cia-ext-launcher-pop" role="menu">
          <p className="cia-ext-launcher-title">Apps</p>
          <div className="cia-ext-launcher-apps">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`cia-ext-launcher-app${item.danger ? " is-danger" : ""}`}
                onClick={() => { item.onClick(); setOpen(false); }}
              >
                <span className="cia-ext-launcher-app-icon" aria-hidden="true">{item.icon}</span>
                <span className="cia-ext-launcher-app-label">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </PortalPopover>
    </div>
  );
}

export function TopBar({ healthState, user, apps = [], onClose, onOpenAi, aiModels = [], darkMode, onToggleDark }) {
  const status = healthState?.ok === true ? "online" : healthState?.ok === false ? "offline" : "unknown";
  const statusLabel =
    status === "online" ? "Connected" : status === "offline" ? "Disconnected" : "Checking…";

  const aiTitle = aiModels.length
    ? `AI in use: ${aiModels.map((m) => `${m.name} · ${m.model}`).join(", ")} — click to manage`
    : "Using the built-in model — click to add your own AI providers";

  return (
    <header className="cia-ext-topbar">
      <div className="cia-ext-brand">
        <span className={`cia-ext-status cia-ext-status-${status}`} title={statusLabel}>
          <span className="cia-ext-status-text">{statusLabel}</span>
        </span>
        {onOpenAi ? (
          <button
            type="button"
            className={`cia-ext-ai-brainbtn${aiModels.length ? " is-on" : ""}`}
            onClick={onOpenAi}
            title={aiTitle}
            aria-label={aiTitle}
          >
            <span className="cia-ext-ai-brain" aria-hidden="true">🧠</span>
          </button>
        ) : null}
      </div>

      <div className="cia-ext-topbar-actions">
        {onToggleDark ? (
          <button
            type="button"
            className="cia-ext-dark-toggle"
            onClick={onToggleDark}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={darkMode ? "Light mode" : "Dark mode"}
          >
            {darkMode ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.5 9.5a5.5 5.5 0 01-7-7A5.5 5.5 0 1013.5 9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            )}
          </button>
        ) : null}
      </div>
    </header>
  );
}

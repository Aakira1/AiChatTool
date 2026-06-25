import { useRef, useState } from "react";
import { PortalPopover } from "./PortalPopover.jsx";

/** Close the panel. Inside the on-page floating widget (an iframe) window.close()
 * does nothing, so tell the host widget to collapse; otherwise close the window. */
function closeSidePanel() {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "CIA_PANEL_CLOSE" }, "*");
      return;
    }
  } catch {
    /* ignore */
  }
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
                onClick={() => {
                  item.onClick();
                  setOpen(false);
                }}
              >
                <span className="cia-ext-launcher-app-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="cia-ext-launcher-app-label">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </PortalPopover>
    </div>
  );
}

export function TopBar({ healthState, user, apps = [], onClose, onOpenAi, aiModels = [] }) {
  const status = healthState?.ok === true ? "online" : healthState?.ok === false ? "offline" : "unknown";
  const statusLabel =
    status === "online" ? "Connected" : status === "offline" ? "Disconnected" : "Checking…";

  const launcherItems = apps;

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
        {user?.email ? (
          <span className="cia-ext-user" title={user.email}>
            {user.email}
          </span>
        ) : null}
        <AppLauncher items={launcherItems} />
        <button
          type="button"
          className="cia-ext-icon-btn"
          onClick={onClose ?? closeSidePanel}
          title={onClose ? "Back to home" : "Close panel"}
          aria-label={onClose ? "Back to home" : "Close panel"}
        >
          ✕
        </button>
      </div>
    </header>
  );
}

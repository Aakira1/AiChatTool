import { useRef, useState } from "react";
import { PortalPopover } from "./PortalPopover.jsx";

/** Close the side panel. Chrome lets a panel page close itself via window.close(). */
function closeSidePanel() {
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

export function TopBar({ healthState, user, apps = [] }) {
  const status = healthState?.ok === true ? "online" : healthState?.ok === false ? "offline" : "unknown";
  const statusLabel =
    status === "online" ? "Connected" : status === "offline" ? "Offline" : "Checking…";

  const launcherItems = apps;

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
          onClick={closeSidePanel}
          title="Close panel"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>
    </header>
  );
}

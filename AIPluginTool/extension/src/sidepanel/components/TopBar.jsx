import { useEffect, useRef, useState } from "react";
import { openWebApp } from "../../lib/storage.js";

/** Close the side panel. Chrome lets a panel page close itself via window.close(). */
function closeSidePanel() {
  window.close();
}

function AppLauncher({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="cia-ext-launcher" ref={ref}>
      <button
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
      {open ? (
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
      ) : null}
    </div>
  );
}

export function TopBar({ healthState, user, onLogout, onOpenOptions, onOpenForums, compact = false }) {
  const status = healthState?.ok === true ? "online" : healthState?.ok === false ? "offline" : "unknown";
  const statusLabel =
    status === "online" ? "Connected" : status === "offline" ? "Offline" : "Checking…";

  const launcherItems = [
    ...(onOpenForums ? [{ label: "Forums", icon: "💬", onClick: onOpenForums }] : []),
    ...(onOpenOptions ? [{ label: "Settings", icon: "⚙️", onClick: onOpenOptions }] : []),
    { label: "Web app", icon: "↗", onClick: () => void openWebApp() },
    ...(onLogout ? [{ label: "Sign out", icon: "⎋", onClick: onLogout, danger: true }] : []),
  ];

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
        {!compact && user?.email ? (
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

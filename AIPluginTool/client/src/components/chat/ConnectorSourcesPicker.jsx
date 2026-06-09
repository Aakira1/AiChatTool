import { useCallback, useEffect, useRef, useState } from "react";
import { listConnectors } from "../../lib/api.js";
import { ConnectorIcon } from "../../lib/ConnectorIcon.jsx";

export function ConnectorSourcesPicker({ selected, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [connectors, setConnectors] = useState([]);
  const wrapRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await listConnectors();
      setConnectors(data.connectors ?? []);
    } catch {
      setConnectors([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const connectable = connectors.filter((c) => c.connected);
  const count = selected.length;

  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  return (
    <div className="cia-sources-picker" ref={wrapRef}>
      <button
        type="button"
        className={`cia-sources-btn${count > 0 ? " active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        title="Search connected apps"
      >
        🔌 Sources{count > 0 ? ` · ${count}` : ""}
      </button>
      {open ? (
        <div className="cia-sources-popover">
          {connectable.length === 0 ? (
            <p className="cia-sources-empty">
              No connected apps. Open Settings → App connectors to connect Google Drive, OneDrive,
              SharePoint, Jira, Confluence, or Teams.
            </p>
          ) : (
            connectable.map((connector) => (
              <label key={connector.id} className="cia-sources-option">
                <input
                  type="checkbox"
                  checked={selected.includes(connector.id)}
                  onChange={() => toggle(connector.id)}
                />
                <span className="cia-sources-option-icon"><ConnectorIcon id={connector.icon} /></span>
                {connector.label}
              </label>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { listConnectors } from "../../lib/api.js";

const SOURCES = [
  { id: "webSearch", label: "Include web results", icon: "🌐" },
  { id: "companyKnowledge", label: "Search company knowledge", icon: "🏢" },
];

export function SourcesPanel({ sources, onChange, connectorSources = [], onConnectorsChange, onClose }) {
  const panelRef = useRef(null);
  const [connectors, setConnectors] = useState([]);

  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  useEffect(() => {
    listConnectors()
      .then((data) => setConnectors((data.connectors ?? []).filter((c) => c.connected)))
      .catch(() => setConnectors([]));
  }, []);

  const toggleConnector = (id) => {
    if (!onConnectorsChange) return;
    onConnectorsChange(
      connectorSources.includes(id)
        ? connectorSources.filter((s) => s !== id)
        : [...connectorSources, id],
    );
  };

  return (
    <div className="cia-ext-sources-panel" ref={panelRef}>
      <div className="cia-ext-sources-header">Sources</div>
      {SOURCES.map(({ id, label, icon }) => (
        <div key={id} className="cia-ext-sources-row">
          <span className="cia-ext-sources-icon">{icon}</span>
          <span className="cia-ext-sources-label">{label}</span>
          <button
            type="button"
            className={`cia-ext-toggle ${sources[id] ? "is-on" : ""}`}
            onClick={() => onChange({ ...sources, [id]: !sources[id] })}
            aria-label={`Toggle ${label}`}
          >
            <span className="cia-ext-toggle-thumb" />
          </button>
        </div>
      ))}

      {connectors.length > 0 && onConnectorsChange ? (
        <>
          <div className="cia-ext-sources-header">Connected apps</div>
          {connectors.map((connector) => (
            <div key={connector.id} className="cia-ext-sources-row">
              <span className="cia-ext-sources-icon">{connector.icon ?? "🔌"}</span>
              <span className="cia-ext-sources-label">{connector.label}</span>
              <button
                type="button"
                className={`cia-ext-toggle ${connectorSources.includes(connector.id) ? "is-on" : ""}`}
                onClick={() => toggleConnector(connector.id)}
                aria-label={`Toggle ${connector.label}`}
              >
                <span className="cia-ext-toggle-thumb" />
              </button>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}

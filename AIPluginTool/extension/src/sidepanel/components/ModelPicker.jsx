import { useEffect, useRef, useState } from "react";
import { providerMeta } from "../../lib/aiProviders.js";

function readyProviders(data) {
  return (data?.providers ?? []).filter((p) => p.enabled !== false && p.apiKey && p.model);
}

// The composer model picker — lists the built-in model plus every AI provider
// the user configured in Settings, and an "All active" option that fans the
// chat out to several models at once.
export function ModelPicker({ value, onChange, onClose, providersData }) {
  const panelRef = useRef(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const ready = readyProviders(providersData);
  const activeIds = providersData?.activeIds ?? [];
  const activeCount = ready.filter((p) => activeIds.includes(p.id)).length;

  const rows = [
    { id: "server", icon: "✦", full: "Built-in model", description: "OneChat's default (server) model" },
    ...ready.map((p) => ({
      id: p.id,
      icon: "🧠",
      full: providerMeta(p.type).label,
      description: p.model,
    })),
    ...(activeCount >= 2
      ? [{ id: "all", icon: "⛓", full: "All active models", description: `${activeCount} models at once` }]
      : []),
  ];

  const filtered = rows.filter(
    (r) => `${r.full} ${r.description}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="cia-ext-picker-panel" ref={panelRef}>
      <div className="cia-ext-model-search-wrap">
        <input
          className="cia-ext-model-search"
          placeholder="Search models"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>
      {filtered.map((r) => {
        const selected = (value || "server") === r.id;
        return (
          <button
            key={r.id}
            type="button"
            className={`cia-ext-picker-row ${selected ? "is-selected" : ""}`}
            onClick={() => { onChange(r.id); onClose(); }}
          >
            <span className="cia-ext-picker-row-icon">{r.icon}</span>
            <span className="cia-ext-picker-row-text">
              <span className="cia-ext-picker-row-label">{r.full}</span>
              <span className="cia-ext-picker-row-desc">{r.description}</span>
            </span>
            {selected && <span className="cia-ext-picker-check">✓</span>}
          </button>
        );
      })}
      {ready.length === 0 ? (
        <div className="cia-ext-picker-empty">Add an AI provider in Settings → Connections to use your own model.</div>
      ) : null}
    </div>
  );
}

export function providerLabel(value, providersData) {
  const v = value || "server";
  if (v === "server") return "Built-in";
  if (v === "all") {
    const ready = readyProviders(providersData);
    const n = ready.filter((p) => (providersData?.activeIds ?? []).includes(p.id)).length;
    return `${n} models`;
  }
  const p = (providersData?.providers ?? []).find((x) => x.id === v);
  return p ? providerMeta(p.type).label : "Built-in";
}

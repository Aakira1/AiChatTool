import { useEffect, useRef, useState } from "react";

// Mirrors AI_PROVIDERS in client/src/lib/settings.js so the extension offers the
// same connection options the web app and server support.
export const PROVIDERS = [
  { id: "server", label: "Server default", full: "Use server default", description: "Server's configured provider", icon: "✦" },
  { id: "openai", label: "OpenAI", full: "OpenAI", description: "GPT models via OpenAI API", icon: "◍" },
  { id: "azure", label: "Azure OpenAI", full: "Azure OpenAI", description: "Microsoft Azure OpenAI Service", icon: "◆" },
  { id: "cloudflare", label: "Cloudflare", full: "Cloudflare Workers AI", description: "Workers AI (Llama, etc.)", icon: "▲" },
  { id: "custom", label: "Custom", full: "Custom (OpenAI-compatible)", description: "Ollama, Together, Groq…", icon: "⊕" },
  { id: "copilot-studio", label: "Copilot Studio", full: "Copilot Studio agent", description: "Microsoft Copilot Studio (Direct Line)", icon: "❖" },
];

export function ModelPicker({ value, onChange, onClose }) {
  const panelRef = useRef(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const filtered = PROVIDERS.filter((p) =>
    p.full.toLowerCase().includes(search.toLowerCase()),
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
      {filtered.map((provider) => (
        <button
          key={provider.id}
          type="button"
          className={`cia-ext-picker-row ${value === provider.id ? "is-selected" : ""}`}
          onClick={() => { onChange(provider.id); onClose(); }}
        >
          <span className="cia-ext-picker-row-icon">{provider.icon}</span>
          <span className="cia-ext-picker-row-text">
            <span className="cia-ext-picker-row-label">{provider.full}</span>
            <span className="cia-ext-picker-row-desc">{provider.description}</span>
          </span>
          {value === provider.id && <span className="cia-ext-picker-check">✓</span>}
        </button>
      ))}
      {filtered.length === 0 && (
        <div className="cia-ext-picker-empty">No models match “{search}”.</div>
      )}
    </div>
  );
}

export function providerLabel(id) {
  return PROVIDERS.find((p) => p.id === id)?.label ?? "Server default";
}

import { useEffect, useRef } from "react";

export const REASONING_MODES = [
  {
    id: "auto",
    label: "Let AI decide",
    description: "Picks reasoning for the job",
    icon: "✦",
  },
  {
    id: "quick",
    label: "Quick answers",
    description: "Faster replies with lighter reasoning",
    icon: "⚡",
  },
  {
    id: "deep",
    label: "Think deeper",
    description: "Longer thinking for robust responses",
    icon: "🧠",
  },
  {
    id: "research",
    label: "Deep Research",
    description: "Synthesise insights and create reports",
    icon: "🔬",
  },
];

export function ReasoningPicker({ value, onChange, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div className="cia-ext-picker-panel" ref={panelRef}>
      <div className="cia-ext-picker-header">Reasoning</div>
      {REASONING_MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          className={`cia-ext-picker-row ${value === mode.id ? "is-selected" : ""}`}
          onClick={() => { onChange(mode.id); onClose(); }}
        >
          <span className="cia-ext-picker-row-icon">{mode.icon}</span>
          <span className="cia-ext-picker-row-text">
            <span className="cia-ext-picker-row-label">{mode.label}</span>
            <span className="cia-ext-picker-row-desc">{mode.description}</span>
          </span>
          {value === mode.id && <span className="cia-ext-picker-check">✓</span>}
        </button>
      ))}
    </div>
  );
}

export function reasoningLabel(id) {
  return REASONING_MODES.find((m) => m.id === id)?.label ?? "Auto";
}

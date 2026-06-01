import { useEffect, useRef } from "react";

export const HOT_TOPICS = [
  { label: "Map Ci → CiA", text: "Map this Ci term to CiA and explain differences:", icon: "🔁" },
  { label: "Similar cases", text: "Find similar CI/CIA cases for:", icon: "🔍" },
  { label: "Compare metrics", text: "Compare CI vs CiA open cases and search reliability.", icon: "📊" },
  { label: "Summarize page", text: "Summarize this page for a CiA transition context.", icon: "📝" },
];

export function HotTopicsPopup({ onSelect, onClose }) {
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
      <div className="cia-ext-picker-header">Hot topics</div>
      {HOT_TOPICS.map((topic) => (
        <button
          key={topic.label}
          type="button"
          className="cia-ext-picker-row"
          onClick={() => { onSelect(topic.text); onClose(); }}
        >
          <span className="cia-ext-picker-row-icon">{topic.icon}</span>
          <span className="cia-ext-picker-row-text">
            <span className="cia-ext-picker-row-label">{topic.label}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

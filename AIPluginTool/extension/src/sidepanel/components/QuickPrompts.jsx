const PROMPTS = [
  { label: "Map Ci → CiA", text: "Map this Ci term to CiA and explain differences:" },
  { label: "Similar cases", text: "Find similar CI/CIA cases for:" },
  { label: "Compare metrics", text: "Compare CI vs CiA open cases and search reliability." },
  { label: "Summarize page", text: "Summarize this page for a CiA transition context." },
];

export function QuickPrompts({ onSelect, disabled }) {
  return (
    <div className="cia-ext-quick-prompts" role="group" aria-label="Quick prompts">
      {PROMPTS.map((prompt) => (
        <button
          key={prompt.label}
          type="button"
          className="cia-ext-quick-prompt"
          disabled={disabled}
          onClick={() => onSelect(prompt.text)}
        >
          {prompt.label}
        </button>
      ))}
    </div>
  );
}

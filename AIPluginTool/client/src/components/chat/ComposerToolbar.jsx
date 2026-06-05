import { useEffect, useRef, useState } from "react";
import { listConnectors } from "../../lib/api.js";
import { TEMPLATES } from "../../lib/templates.js";

export const REASONING_MODES = [
  { id: "auto", label: "Let AI decide", description: "Picks reasoning for the job", icon: "✦" },
  { id: "quick", label: "Quick answers", description: "Faster replies with lighter reasoning", icon: "⚡" },
  { id: "deep", label: "Think deeper", description: "Longer thinking for robust responses", icon: "🧠" },
  { id: "research", label: "Deep Research", description: "Synthesise insights and create reports", icon: "🔬" },
];

export const PROVIDERS = [
  { id: "server", label: "Server default", full: "Use server default", description: "Server's configured provider", icon: "✦" },
  { id: "openai", label: "OpenAI", full: "OpenAI", description: "GPT models via OpenAI API", icon: "◍" },
  { id: "azure", label: "Azure OpenAI", full: "Azure OpenAI", description: "Microsoft Azure OpenAI Service", icon: "◆" },
  { id: "cloudflare", label: "Cloudflare", full: "Cloudflare Workers AI", description: "Workers AI (Llama, etc.)", icon: "▲" },
  { id: "custom", label: "Custom", full: "Custom (OpenAI-compatible)", description: "Ollama, Together, Groq…", icon: "⊕" },
  { id: "copilot-studio", label: "Copilot Studio", full: "Copilot Studio agent", description: "Microsoft Copilot Studio (Direct Line)", icon: "❖" },
];

export const HOT_TOPICS = [
  { label: "Map Ci → CiA", text: "Map this Ci term to CiA and explain differences:", icon: "🔁" },
  { label: "Similar cases", text: "Find similar CI/CIA cases for:", icon: "🔍" },
  { label: "Compare metrics", text: "Compare CI vs CiA open cases and search reliability.", icon: "📊" },
  { label: "Summarize", text: "Summarize this for a CiA transition context.", icon: "📝" },
];

export function reasoningLabel(id) {
  return REASONING_MODES.find((m) => m.id === id)?.label ?? "Let AI decide";
}

export function providerLabel(id) {
  return PROVIDERS.find((p) => p.id === id)?.label ?? "Server default";
}

function PickerPanel({ title, children }) {
  return (
    <div className="cia-toolbar-picker">
      {title ? <div className="cia-toolbar-picker-header">{title}</div> : null}
      {children}
    </div>
  );
}

function PickerRow({ icon, label, desc, selected, onClick }) {
  return (
    <button
      type="button"
      className={`cia-toolbar-picker-row${selected ? " is-selected" : ""}`}
      onClick={onClick}
    >
      <span className="cia-toolbar-picker-icon">{icon}</span>
      <span className="cia-toolbar-picker-text">
        <span className="cia-toolbar-picker-label">{label}</span>
        {desc ? <span className="cia-toolbar-picker-desc">{desc}</span> : null}
      </span>
      {selected ? <span className="cia-toolbar-picker-check">✓</span> : null}
    </button>
  );
}

export function ComposerToolbar({
  connectorSources = [],
  onConnectorSourcesChange,
  reasoning = "auto",
  onReasoningChange,
  provider = "server",
  onProviderChange,
  onTopicSelect,
  onTemplateSelect,
  sources = { webSearch: false, companyKnowledge: true },
  onSourcesChange,
  disabled,
}) {
  const [open, setOpen] = useState(null); // "sources" | "topics" | "reasoning" | "model"
  const [connectors, setConnectors] = useState([]);
  const wrapRef = useRef(null);

  const toggle = (id) => setOpen((cur) => (cur === id ? null : id));
  const close = () => setOpen(null);

  useEffect(() => {
    let active = true;
    listConnectors()
      .then((data) => active && setConnectors(data.connectors ?? []))
      .catch(() => active && setConnectors([]));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) close();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const connectable = connectors.filter((c) => c.connected);
  const sourceCount = connectorSources.length;

  const toggleSource = (id) =>
    onConnectorSourcesChange?.(
      connectorSources.includes(id)
        ? connectorSources.filter((s) => s !== id)
        : [...connectorSources, id],
    );

  return (
    <div className="cia-toolbar" ref={wrapRef}>
      {/* Sources — web results, company knowledge, and connected apps */}
      <div className="cia-toolbar-wrap">
        <button
          type="button"
          className={`cia-toolbar-btn${totalSourceCount > 0 ? " is-active" : ""}`}
          onClick={() => toggle("sources")}
          disabled={disabled}
          title="Sources"
        >
          <span>+</span>
          {totalSourceCount > 0 ? (
            <span className="cia-toolbar-badge">{totalSourceCount}</span>
          ) : null}
        </button>
        {open === "sources" ? (
          <PickerPanel title="Sources">
            <PickerRow
              icon="🌐"
              label="Include web results"
              desc="Search the web and use results in the answer"
              selected={sources.webSearch}
              onClick={() => onSourcesChange?.({ ...sources, webSearch: !sources.webSearch })}
            />
            <PickerRow
              icon="🏢"
              label="Search company knowledge"
              desc="Use imported knowledge base & cases"
              selected={sources.companyKnowledge}
              onClick={() =>
                onSourcesChange?.({ ...sources, companyKnowledge: !sources.companyKnowledge })
              }
            />
            {connectable.length === 0 ? (
              <p className="cia-toolbar-picker-empty">
                No connected apps. Open Settings → App connectors to connect Google Drive, OneDrive,
                SharePoint, Jira, Confluence, or Teams.
              </p>
            ) : (
              connectable.map((connector) => (
                <PickerRow
                  key={connector.id}
                  icon={connector.icon ?? "🔌"}
                  label={connector.label}
                  selected={connectorSources.includes(connector.id)}
                  onClick={() => toggleSource(connector.id)}
                />
              ))
            )}
          </PickerPanel>
        ) : null}
      </div>

      {/* Topics */}
      <div className="cia-toolbar-wrap">
        <button
          type="button"
          className="cia-toolbar-pill"
          onClick={() => toggle("topics")}
          disabled={disabled}
          title="Hot topics"
        >
          ✨ Topics
        </button>
        {open === "topics" ? (
          <PickerPanel title="Hot topics">
            {HOT_TOPICS.map((topic) => (
              <PickerRow
                key={topic.label}
                icon={topic.icon}
                label={topic.label}
                onClick={() => {
                  onTopicSelect?.(topic.text);
                  close();
                }}
              />
            ))}
          </PickerPanel>
        ) : null}
      </div>

      {/* Templates */}
      <div className="cia-toolbar-wrap">
        <button
          type="button"
          className="cia-toolbar-pill"
          onClick={() => toggle("templates")}
          disabled={disabled}
          title="Document templates"
        >
          📄 Templates
        </button>
        {open === "templates" ? (
          <PickerPanel title="Start from a template">
            {TEMPLATES.map((tpl) => (
              <PickerRow
                key={tpl.id}
                icon={tpl.icon}
                label={tpl.label}
                desc={tpl.description}
                onClick={() => {
                  onTemplateSelect?.(tpl.prompt);
                  close();
                }}
              />
            ))}
          </PickerPanel>
        ) : null}
      </div>

      {/* Reasoning */}
      <div className="cia-toolbar-wrap">
        <button
          type="button"
          className={`cia-toolbar-pill${reasoning !== "auto" ? " is-active" : ""}`}
          onClick={() => toggle("reasoning")}
          title="Reasoning mode"
        >
          ⚙ {reasoningLabel(reasoning)}
        </button>
        {open === "reasoning" ? (
          <PickerPanel title="Reasoning">
            {REASONING_MODES.map((mode) => (
              <PickerRow
                key={mode.id}
                icon={mode.icon}
                label={mode.label}
                desc={mode.description}
                selected={reasoning === mode.id}
                onClick={() => {
                  onReasoningChange?.(mode.id);
                  close();
                }}
              />
            ))}
          </PickerPanel>
        ) : null}
      </div>

      {/* Model / provider */}
      <div className="cia-toolbar-wrap">
        <button
          type="button"
          className={`cia-toolbar-pill${provider !== "server" ? " is-active" : ""}`}
          onClick={() => toggle("model")}
          title="Model"
        >
          {providerLabel(provider)}
        </button>
        {open === "model" ? (
          <PickerPanel title="Model">
            {PROVIDERS.map((p) => (
              <PickerRow
                key={p.id}
                icon={p.icon}
                label={p.full}
                desc={p.description}
                selected={provider === p.id}
                onClick={() => {
                  onProviderChange?.(p.id);
                  close();
                }}
              />
            ))}
          </PickerPanel>
        ) : null}
      </div>
    </div>
  );
}

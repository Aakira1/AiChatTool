import { useState } from "react";
import { SourcesPanel } from "./SourcesPanel.jsx";
import { ReasoningPicker, reasoningLabel } from "./ReasoningPicker.jsx";
import { ModelPicker, providerLabel } from "./ModelPicker.jsx";
import { HotTopicsPopup } from "./HotTopicsPopup.jsx";
import { PageContextPopup } from "./PageContextPopup.jsx";

export function ComposerToolbar({
  sources,
  onSourcesChange,
  connectorSources = [],
  onConnectorSourcesChange,
  reasoning,
  onReasoningChange,
  provider,
  onProviderChange,
  onTopicSelect,
  pageContext,
  includeContext,
  capturingPage,
  onToggleContext,
  onRefreshContext,
  onCapturePage,
  onClearScreenshot,
  disabled,
}) {
  const [open, setOpen] = useState(null); // "sources" | "context" | "topics" | "reasoning" | "model"
  const toggle = (id) => setOpen((cur) => (cur === id ? null : id));
  const close = () => setOpen(null);

  const activeSourceCount =
    Object.values(sources).filter(Boolean).length + connectorSources.length;
  const contextOn = pageContext && !pageContext.restricted && includeContext;

  return (
    <div className="cia-ext-toolbar">
      {/* Sources */}
      <div className="cia-ext-toolbar-popover-wrap cia-ext-align-left">
        <button
          type="button"
          className={`cia-ext-toolbar-btn ${activeSourceCount > 0 ? "is-active" : ""}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => toggle("sources")}
          title="Sources"
        >
          <span>+</span>
          {activeSourceCount > 0 && (
            <span className="cia-ext-toolbar-badge">{activeSourceCount}</span>
          )}
        </button>
        {open === "sources" && (
          <SourcesPanel
            sources={sources}
            onChange={onSourcesChange}
            connectorSources={connectorSources}
            onConnectorsChange={onConnectorSourcesChange}
            onClose={close}
          />
        )}
      </div>

      {/* Page context */}
      <div className="cia-ext-toolbar-popover-wrap cia-ext-align-left">
        <button
          type="button"
          className={`cia-ext-toolbar-pill ${contextOn ? "is-active" : ""}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => toggle("context")}
          title="Page context"
          disabled={!pageContext}
        >
          🌐 Page
        </button>
        {open === "context" && (
          <PageContextPopup
            context={pageContext}
            included={includeContext}
            capturing={capturingPage}
            onToggle={onToggleContext}
            onRefresh={onRefreshContext}
            onCapture={onCapturePage}
            onClearScreenshot={onClearScreenshot}
            onClose={close}
          />
        )}
      </div>

      {/* Hot topics */}
      <div className="cia-ext-toolbar-popover-wrap cia-ext-align-left">
        <button
          type="button"
          className="cia-ext-toolbar-pill"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => toggle("topics")}
          title="Hot topics"
          disabled={disabled}
        >
          ✨ Topics
        </button>
        {open === "topics" && (
          <HotTopicsPopup onSelect={onTopicSelect} onClose={close} />
        )}
      </div>

      {/* Reasoning */}
      <div className="cia-ext-toolbar-popover-wrap">
        <button
          type="button"
          className={`cia-ext-toolbar-pill ${reasoning !== "auto" ? "is-active" : ""}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => toggle("reasoning")}
          title="Reasoning mode"
        >
          ⚙ {reasoningLabel(reasoning)}
        </button>
        {open === "reasoning" && (
          <ReasoningPicker value={reasoning} onChange={onReasoningChange} onClose={close} />
        )}
      </div>

      {/* Model / provider */}
      <div className="cia-ext-toolbar-popover-wrap">
        <button
          type="button"
          className={`cia-ext-toolbar-pill ${provider !== "server" ? "is-active" : ""}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => toggle("model")}
          title="Model"
        >
          {providerLabel(provider)}
        </button>
        {open === "model" && (
          <ModelPicker value={provider} onChange={onProviderChange} onClose={close} />
        )}
      </div>
    </div>
  );
}

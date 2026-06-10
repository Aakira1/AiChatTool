import { useRef, useState } from "react";
import { PortalPopover } from "./PortalPopover.jsx";
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

  const sourcesBtn = useRef(null);
  const contextBtn = useRef(null);
  const topicsBtn = useRef(null);
  const reasoningBtn = useRef(null);
  const modelBtn = useRef(null);

  const activeSourceCount =
    Object.values(sources).filter(Boolean).length + connectorSources.length;
  const contextOn = pageContext && !pageContext.restricted && includeContext;

  return (
    <div className="cia-ext-toolbar">
      {/* Sources */}
      <div className="cia-ext-toolbar-popover-wrap">
        <button
          ref={sourcesBtn}
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
        <PortalPopover
          anchorRef={sourcesBtn}
          open={open === "sources"}
          placement="above"
          align="start"
          onClose={close}
        >
          <SourcesPanel
            sources={sources}
            onChange={onSourcesChange}
            connectorSources={connectorSources}
            onConnectorsChange={onConnectorSourcesChange}
            onClose={close}
          />
        </PortalPopover>
      </div>

      {/* Page context */}
      <div className="cia-ext-toolbar-popover-wrap">
        <button
          ref={contextBtn}
          type="button"
          className={`cia-ext-toolbar-pill ${contextOn ? "is-active" : ""}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => toggle("context")}
          title="Page context"
          disabled={!pageContext}
        >
          🌐 Page
        </button>
        <PortalPopover
          anchorRef={contextBtn}
          open={open === "context"}
          placement="above"
          align="start"
          onClose={close}
        >
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
        </PortalPopover>
      </div>

      {/* Hot topics */}
      <div className="cia-ext-toolbar-popover-wrap">
        <button
          ref={topicsBtn}
          type="button"
          className="cia-ext-toolbar-pill"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => toggle("topics")}
          title="Hot topics"
          disabled={disabled}
        >
          ✨ Topics
        </button>
        <PortalPopover
          anchorRef={topicsBtn}
          open={open === "topics"}
          placement="above"
          align="start"
          onClose={close}
        >
          <HotTopicsPopup onSelect={onTopicSelect} onClose={close} />
        </PortalPopover>
      </div>

      {/* Reasoning */}
      <div className="cia-ext-toolbar-popover-wrap">
        <button
          ref={reasoningBtn}
          type="button"
          className={`cia-ext-toolbar-pill ${reasoning !== "auto" ? "is-active" : ""}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => toggle("reasoning")}
          title="Reasoning mode"
        >
          ⚙ {reasoningLabel(reasoning)}
        </button>
        <PortalPopover
          anchorRef={reasoningBtn}
          open={open === "reasoning"}
          placement="above"
          align="end"
          onClose={close}
        >
          <ReasoningPicker value={reasoning} onChange={onReasoningChange} onClose={close} />
        </PortalPopover>
      </div>

      {/* Model / provider */}
      <div className="cia-ext-toolbar-popover-wrap">
        <button
          ref={modelBtn}
          type="button"
          className={`cia-ext-toolbar-pill ${provider !== "server" ? "is-active" : ""}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => toggle("model")}
          title="Model"
        >
          {providerLabel(provider)}
        </button>
        <PortalPopover
          anchorRef={modelBtn}
          open={open === "model"}
          placement="above"
          align="end"
          onClose={close}
        >
          <ModelPicker value={provider} onChange={onProviderChange} onClose={close} />
        </PortalPopover>
      </div>
    </div>
  );
}

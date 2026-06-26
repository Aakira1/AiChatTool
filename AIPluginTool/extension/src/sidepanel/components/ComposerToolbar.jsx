import { useRef, useState } from "react";
import { PortalPopover } from "./PortalPopover.jsx";
import { SourcesPanel } from "./SourcesPanel.jsx";
import { ReasoningPicker, reasoningLabel } from "./ReasoningPicker.jsx";
import { ModelPicker, providerLabel } from "./ModelPicker.jsx";
import { VisionPanel } from "./VisionPanel.jsx";

export function ComposerToolbar({
  sources,
  onSourcesChange,
  connectorSources = [],
  onConnectorSourcesChange,
  reasoning,
  onReasoningChange,
  chatModel,
  onChatModelChange,
  providersData,
  pageContext,
  includeContext,
  capturingPage,
  onToggleContext,
  onRefreshContext,
  onCapturePage,
  onClearScreenshot,
  wholePageVision,
  onToggleWholePageVision,
  disabled,
}) {
  const [open, setOpen] = useState(null);
  const toggle = (id) => setOpen((cur) => (cur === id ? null : id));
  const close = () => setOpen(null);

  const visionBtn = useRef(null);
  const reasoningBtn = useRef(null);
  const modelBtn = useRef(null);

  const visionOn =
    (pageContext && !pageContext.restricted && includeContext) || wholePageVision || Boolean(pageContext?.screenshot);

  return (
    <div className="cia-ext-toolbar">
      {/* AI Vision */}
      <div className="cia-ext-toolbar-popover-wrap">
        <button
          ref={visionBtn}
          type="button"
          className={`cia-ext-toolbar-pill ${visionOn ? "is-active" : ""}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => toggle("vision")}
          title="AI Vision — let the assistant see this page"
        >
          Vision
        </button>
        <PortalPopover
          anchorRef={visionBtn}
          open={open === "vision"}
          placement="above"
          align="start"
          onClose={close}
        >
          <VisionPanel
            pageContext={pageContext}
            includeContext={includeContext}
            onToggleContext={onToggleContext}
            wholePageVision={wholePageVision}
            onToggleWholePageVision={onToggleWholePageVision}
            capturing={capturingPage}
            onCapture={onCapturePage}
            onClearScreenshot={onClearScreenshot}
            onClose={close}
          />
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
          {reasoningLabel(reasoning)}
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
          className={`cia-ext-toolbar-pill ${chatModel && chatModel !== "server" ? "is-active" : ""}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => toggle("model")}
          title="AI model — choose which provider(s) answer"
        >
          {providerLabel(chatModel, providersData)}
        </button>
        <PortalPopover
          anchorRef={modelBtn}
          open={open === "model"}
          placement="above"
          align="end"
          onClose={close}
        >
          <ModelPicker value={chatModel} onChange={onChatModelChange} onClose={close} providersData={providersData} />
        </PortalPopover>
      </div>
    </div>
  );
}

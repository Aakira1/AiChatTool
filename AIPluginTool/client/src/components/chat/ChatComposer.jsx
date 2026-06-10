import { useRef, useState } from "react";
import { readDocumentFiles } from "../../lib/documents.js";
import { ComposerToolbar } from "./ComposerToolbar.jsx";

export function ChatComposer({
  input,
  onInputChange,
  attachments,
  onAttachmentsChange,
  onSubmit,
  pending,
  onError,
  connectorSources = [],
  onConnectorSourcesChange,
  reasoning,
  onReasoningChange,
  provider,
  onProviderChange,
  onTopicSelect,
  onTemplateSelect,
  sources,
  onSourcesChange,
}) {
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const addFiles = async (files) => {
    if (!files?.length) return;
    try {
      const parsed = await readDocumentFiles(files);
      onAttachmentsChange([...attachments, ...parsed].slice(0, 3));
      onError("");
    } catch (attachError) {
      onError(attachError.message);
    }
  };

  const handleAttach = async (event) => {
    await addFiles(event.target.files);
    event.target.value = "";
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setDragActive(false);
    if (pending) return;
    const files = event.dataTransfer?.files;
    if (files?.length) await addFiles(files);
  };

  // Ctrl+V: attach pasted images/files (e.g. a screenshot on the clipboard).
  const handlePaste = async (event) => {
    if (pending) return;
    const files = [...(event.clipboardData?.files ?? [])];
    if (!files.length) return; // plain text paste — let it through
    event.preventDefault();
    // Clipboard images all arrive named "image.png" — make names unique so
    // chips/removal (keyed by name) don't collide.
    const named = files.map((f, i) => {
      const ext = (f.type.split("/")[1] || "png").replace("jpeg", "jpg");
      return f.name && f.name !== "image.png"
        ? f
        : new File([f], `pasted-${Date.now()}-${i + 1}.${ext}`, { type: f.type });
    });
    await addFiles(named);
  };

  const removeAttachment = (name) => {
    onAttachmentsChange(attachments.filter((file) => file.name !== name));
  };

  return (
    <div
      className={`cia-composer${dragActive ? " is-drag" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes("Files")) {
          e.preventDefault();
          if (!pending) setDragActive(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragActive(false);
      }}
      onDrop={(e) => void handleDrop(e)}
      onPaste={(e) => void handlePaste(e)}
    >
      {dragActive ? (
        <div className="cia-composer-dropmask">Drop images or documents to attach</div>
      ) : null}
      <ComposerToolbar
        connectorSources={connectorSources}
        onConnectorSourcesChange={onConnectorSourcesChange}
        reasoning={reasoning}
        onReasoningChange={onReasoningChange}
        provider={provider}
        onProviderChange={onProviderChange}
        onTopicSelect={onTopicSelect}
        onTemplateSelect={onTemplateSelect}
        sources={sources}
        onSourcesChange={onSourcesChange}
        disabled={pending}
      />

      {attachments.length > 0 ? (
        <div className="cia-attachment-list">
          {attachments.map((file) => (
            <span
              key={file.name}
              className={`cia-attachment-chip${file.kind === "image" ? " is-image" : ""}`}
            >
              {file.kind === "image" && file.dataUrl ? (
                <img className="cia-attachment-thumb" src={file.dataUrl} alt={file.name} />
              ) : null}
              <span>
                {file.kind === "image" ? "🖼" : "📎"} {file.name}
              </span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => removeAttachment(file.name)}
                disabled={pending}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <form
        className="cia-input-area"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <button
          type="button"
          className="cia-attach-btn"
          title="Attach an image or document"
          onClick={() => fileInputRef.current?.click()}
          disabled={pending || attachments.length >= 3}
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="cia-file-input-hidden"
          accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,.png,.jpg,.jpeg,.gif,.webp,.bmp,.txt,.csv,.md,.json,.pdf,.docx,.html,.htm,.log,.xml,text/plain,text/csv,text/markdown,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          onChange={(event) => void handleAttach(event)}
        />
        <input
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="Ask a question, or drag & drop an image or document…"
          disabled={pending}
        />
        <button type="submit" className="cia-send-btn" disabled={pending}>
          Send →
        </button>
      </form>
      <p className="cia-composer-hint">
        Drag &amp; drop or attach up to 3 files — images (PNG/JPG, read by AI vision) or documents
        (TXT, CSV, MD, JSON, PDF, DOCX)
      </p>
    </div>
  );
}

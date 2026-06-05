import { useRef } from "react";
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

  const handleAttach = async (event) => {
    const files = event.target.files;
    if (!files?.length) {
      return;
    }

    try {
      const parsed = await readDocumentFiles(files);
      onAttachmentsChange([...attachments, ...parsed].slice(0, 3));
      onError("");
    } catch (attachError) {
      onError(attachError.message);
    } finally {
      event.target.value = "";
    }
  };

  const removeAttachment = (name) => {
    onAttachmentsChange(attachments.filter((file) => file.name !== name));
  };

  return (
    <div className="cia-composer">
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
            <span key={file.name} className="cia-attachment-chip">
              <span>📎 {file.name}</span>
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
          title="Attach .txt, .csv, .md, or .json"
          onClick={() => fileInputRef.current?.click()}
          disabled={pending || attachments.length >= 3}
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="cia-file-input-hidden"
          accept=".txt,.csv,.md,.json,.pdf,.docx,.html,.htm,.log,.xml,text/plain,text/csv,text/markdown,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          onChange={(event) => void handleAttach(event)}
        />
        <input
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="Ask about CiA terminology, processes, cases, or attach a document..."
          disabled={pending}
        />
        <button type="submit" className="cia-send-btn" disabled={pending}>
          Send →
        </button>
      </form>
      <p className="cia-composer-hint">
        Attach up to 3 documents (TXT, CSV, MD, JSON, PDF, DOCX) for AI analysis
      </p>
    </div>
  );
}

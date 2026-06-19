import { useEffect, useRef, useState } from "react";
import { readPastedFiles } from "../../lib/documents.js";

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  pending,
  attachments = [],
  onAttachmentsChange,
  onError,
}) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  // Shared path for paste / drop / upload — reads any file type into attachments.
  const addFiles = async (fileList) => {
    if (pending || !onAttachmentsChange) return;
    const files = [...(fileList ?? [])];
    if (!files.length) return;
    try {
      const parsed = await readPastedFiles(files);
      onAttachmentsChange([...attachments, ...parsed].slice(0, 3));
      onError?.("");
    } catch (err) {
      onError?.(err.message);
    }
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!pending && (value.trim() || attachments.length)) onSubmit();
    }
  };

  // Ctrl+V: attach pasted images/files (screenshots etc.).
  const handlePaste = async (event) => {
    if (pending || !onAttachmentsChange) return;
    const files = [...(event.clipboardData?.files ?? [])];
    if (!files.length) return; // plain text — let it paste normally
    event.preventDefault();
    await addFiles(files);
  };

  const removeAttachment = (name) => {
    onAttachmentsChange?.(attachments.filter((a) => a.name !== name));
  };

  return (
    <div className="cia-ext-composer-wrap">
      {attachments.length > 0 ? (
        <div className="cia-ext-attach-list">
          {attachments.map((a) => (
            <span key={a.name} className="cia-ext-attach-chip">
              {a.kind === "image" && a.dataUrl ? (
                <img className="cia-ext-attach-thumb" src={a.dataUrl} alt={a.name} />
              ) : (
                <span aria-hidden="true">📎</span>
              )}
              <span className="cia-ext-attach-name">{a.name}</span>
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => removeAttachment(a.name)}
                disabled={pending}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <form
        className={`cia-ext-composer${dragOver ? " is-dragover" : ""}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending && (value.trim() || attachments.length)) onSubmit();
        }}
        onDragOver={(e) => { if (!pending) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer?.files?.length) void addFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }}
        />
        <button
          type="button"
          className="cia-ext-attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={pending}
          aria-label="Attach a file"
          title="Attach a file (any type)"
        >
          +
        </button>
        <textarea
          ref={textareaRef}
          className="cia-ext-textarea"
          placeholder="Message OneChat…"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={(event) => void handlePaste(event)}
          rows={1}
        />
        {pending ? (
          <button type="button" className="cia-ext-stop-btn" onClick={onStop} aria-label="Stop">
            ◼
          </button>
        ) : (
          <button
            type="submit"
            className="cia-ext-send-btn"
            disabled={!value.trim() && attachments.length === 0}
            aria-label="Send"
            title="Send (Enter)"
          >
            →
          </button>
        )}
      </form>
    </div>
  );
}

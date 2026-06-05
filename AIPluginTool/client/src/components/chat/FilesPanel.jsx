import { FileDownloadCard } from "./FileDownloadCard.jsx";

// Slide-over listing every file generated in the active conversation, each
// re-downloadable on demand via the shared FileDownloadCard.
export function FilesPanel({ files, onClose }) {
  return (
    <div className="cia-files-overlay" role="dialog" aria-label="Generated files">
      <div className="cia-files-panel">
        <div className="cia-files-header">
          <strong>Generated files</strong>
          <button
            type="button"
            className="cia-files-close"
            onClick={onClose}
            aria-label="Close files"
          >
            ×
          </button>
        </div>

        <div className="cia-files-body">
          {files.length === 0 ? (
            <p className="cia-files-empty">
              No files yet. Ask the assistant to generate a spreadsheet, document, or report and it
              will appear here for re-download.
            </p>
          ) : (
            files.map((spec) => (
              <FileDownloadCard key={`${spec.messageId}-${spec.index}`} spec={spec} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

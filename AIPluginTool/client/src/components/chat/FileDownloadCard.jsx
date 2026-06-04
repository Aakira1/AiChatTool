import { useState } from "react";
import { downloadXlsxSpec, exportToExcel } from "../../lib/api.js";

const stem = (title) =>
  (title || "export").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "export";

/**
 * A downloadable file chip. Two modes:
 *  - spec mode    (`spec.sheets`)   → deterministic build from a model JSON spec.
 *  - content mode (`spec.content`)  → server parses markdown tables / free text
 *                                     into a workbook (fallback when the model
 *                                     didn't emit a clean JSON spec).
 */
export function FileDownloadCard({ spec }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const title = spec?.title || "Export";
  const fileName = `${stem(title)}.xlsx`;
  const isContent = typeof spec?.content === "string";
  const sheetCount = Array.isArray(spec?.sheets) ? spec.sheets.length : 0;
  const sub = isContent
    ? "Excel spreadsheet"
    : `${sheetCount} sheet${sheetCount === 1 ? "" : "s"} · Excel spreadsheet`;

  async function handleDownload() {
    setBusy(true);
    setError(null);
    try {
      if (isContent) {
        await exportToExcel({ content: spec.content, title });
      } else {
        await downloadXlsxSpec({ title, sheets: spec?.sheets });
      }
    } catch (err) {
      setError(err?.message || "Download failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cia-file-card">
      <div className="cia-file-icon" aria-hidden="true">
        XLS
      </div>
      <div className="cia-file-meta">
        <div className="cia-file-name" title={fileName}>
          {fileName}
        </div>
        <div className="cia-file-sub">
          {sub}
          {error ? <span className="cia-file-error"> · {error}</span> : null}
        </div>
      </div>
      <button type="button" className="cia-file-download" onClick={handleDownload} disabled={busy}>
        {busy ? "Building…" : "Download"}
      </button>
    </div>
  );
}

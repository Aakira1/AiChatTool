import { useState } from "react";
import { downloadDocx, downloadPdf, downloadXlsxSpec, exportToExcel } from "../../lib/api.js";

const stem = (title) =>
  (title || "export").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "export";

const DOC_META = {
  docx: { ext: "docx", glyph: "DOC", color: "#2b579a", run: downloadDocx },
  pdf: { ext: "pdf", glyph: "PDF", color: "#c0392b", run: downloadPdf },
};

function DocumentCard({ spec }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const title = spec?.title || "Document";
  const formats = (spec?.formats?.length ? spec.formats : ["docx", "pdf"]).filter(
    (f) => DOC_META[f],
  );

  async function handleDownload(format) {
    setBusy(format);
    setError(null);
    try {
      await DOC_META[format].run({ content: spec.content, title });
    } catch (err) {
      setError(err?.message || "Download failed");
    } finally {
      setBusy(null);
    }
  }

  const primary = DOC_META[formats[0]] ?? DOC_META.docx;

  return (
    <div className="cia-ext-file-card">
      <div className="cia-ext-file-icon" aria-hidden="true" style={{ background: primary.color }}>
        {primary.glyph}
      </div>
      <div className="cia-ext-file-meta">
        <div className="cia-ext-file-name" title={stem(title)}>
          {stem(title)}
        </div>
        <div className="cia-ext-file-sub">
          Document
          {error ? <span className="cia-ext-file-error"> · {error}</span> : null}
        </div>
      </div>
      <div className="cia-ext-file-actions">
        {formats.map((format) => (
          <button
            key={format}
            type="button"
            className="cia-ext-file-download"
            onClick={() => handleDownload(format)}
            disabled={busy !== null}
          >
            {busy === format ? "…" : DOC_META[format].ext.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Downloadable file chip for the side panel. Two modes:
 *  - spec mode    (`spec.sheets`)   → deterministic build from a model JSON spec.
 *  - content mode (`spec.content`)  → server parses markdown tables / free text.
 */
export function FileDownloadCard({ spec }) {
  if (spec?.kind === "document") {
    return <DocumentCard spec={spec} />;
  }
  return <SpreadsheetCard spec={spec} />;
}

function SpreadsheetCard({ spec }) {
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
    <div className="cia-ext-file-card">
      <div className="cia-ext-file-icon" aria-hidden="true">
        XLS
      </div>
      <div className="cia-ext-file-meta">
        <div className="cia-ext-file-name" title={fileName}>
          {fileName}
        </div>
        <div className="cia-ext-file-sub">
          {sub}
          {error ? <span className="cia-ext-file-error"> · {error}</span> : null}
        </div>
      </div>
      <button
        type="button"
        className="cia-ext-file-download"
        onClick={handleDownload}
        disabled={busy}
      >
        {busy ? "Building…" : "Download"}
      </button>
    </div>
  );
}

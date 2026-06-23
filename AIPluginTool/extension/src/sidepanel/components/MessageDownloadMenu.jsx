import { useEffect, useRef, useState } from "react";
import {
  downloadCsv,
  downloadDocx,
  downloadForm,
  downloadPdf,
  downloadPptx,
  exportToExcel,
} from "../../lib/api.js";
import { deriveFileTitle, hasFormFields, hasMarkdownTable } from "../../lib/fileBlocks.js";

// Deterministic "Download as…" menu for the side panel. Always available on
// assistant messages so a file can be produced even when the model doesn't emit
// a download marker.
export function MessageDownloadMenu({ content, fallbackTitle = "Document" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const title = deriveFileTitle(content, fallbackTitle);

  async function run(kind) {
    setBusy(kind);
    try {
      if (kind === "docx") await downloadDocx({ content, title });
      else if (kind === "pdf") await downloadPdf({ content, title });
      else if (kind === "pptx") await downloadPptx({ content, title });
      else if (kind === "xlsx") await exportToExcel({ content, title });
      else if (kind === "csv") await downloadCsv({ content, title });
      else if (kind === "form") await downloadForm({ content, title });
      setOpen(false);
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }

  const hasTable = hasMarkdownTable(content);
  const options = [
    { kind: "docx", label: "Word (.docx)" },
    { kind: "pdf", label: "PDF (.pdf)" },
    { kind: "pptx", label: "PowerPoint (.pptx)" },
    ...(hasTable ? [{ kind: "xlsx", label: "Excel (.xlsx)" }] : []),
    ...(hasTable ? [{ kind: "csv", label: "CSV (.csv)" }] : []),
    ...(hasFormFields(content) ? [{ kind: "form", label: "Fillable form (PDF)" }] : []),
  ];

  return (
    <div className="cia-ext-dl-menu" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy !== null}
        title="Download as…"
        aria-label="Download as…"
      >
        {busy ? (
          <span className="cia-ext-dl-spin" aria-hidden="true" />
        ) : (
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="m7 10 5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
        )}
      </button>
      {open ? (
        <div className="cia-ext-dl-menu-pop" role="menu">
          {options.map((opt) => (
            <button
              key={opt.kind}
              type="button"
              role="menuitem"
              onClick={() => run(opt.kind)}
              disabled={busy !== null}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

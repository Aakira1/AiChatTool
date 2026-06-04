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

// Deterministic "Download as…" menu. Always available on assistant messages so a
// file can be produced even when the model doesn't emit a download marker.
export function MessageDownloadMenu({ content, fallbackTitle = "Document", disabled }) {
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
      /* surfaced by the caller's toast layer if wired; swallow otherwise */
    } finally {
      setBusy(null);
    }
  }

  const hasTable = hasMarkdownTable(content);
  const options = [
    { kind: "docx", label: "Word (.docx)" },
    { kind: "pdf", label: "PDF (.pdf)" },
    { kind: "pptx", label: "PowerPoint (.pptx)" },
    // Spreadsheet/CSV only make sense if the reply actually has tabular data.
    ...(hasTable ? [{ kind: "xlsx", label: "Excel (.xlsx)" }] : []),
    ...(hasTable ? [{ kind: "csv", label: "CSV (.csv)" }] : []),
    ...(hasFormFields(content) ? [{ kind: "form", label: "Fillable form (PDF)" }] : []),
  ];

  return (
    <div className="cia-dl-menu" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || busy !== null}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? "Building…" : "Download ▾"}
      </button>
      {open ? (
        <div className="cia-dl-menu-pop" role="menu">
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

import { useEffect, useRef, useState } from "react";
import {
  downloadCsv,
  downloadDocx,
  downloadPdf,
  downloadPptx,
  exportToExcel,
} from "../../lib/api.js";
import { deriveFileTitle, hasMarkdownTable } from "../../lib/fileBlocks.js";

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
  ];

  return (
    <div className="cia-ext-dl-menu" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} disabled={busy !== null}>
        {busy ? "Building…" : "Download ▾"}
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

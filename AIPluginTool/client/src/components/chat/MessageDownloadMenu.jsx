import { useEffect, useRef, useState } from "react";
import { downloadDocx, downloadPdf, exportToExcel } from "../../lib/api.js";
import { deriveFileTitle, hasMarkdownTable } from "../../lib/fileBlocks.js";

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
      else if (kind === "xlsx") await exportToExcel({ content, title });
      setOpen(false);
    } catch {
      /* surfaced by the caller's toast layer if wired; swallow otherwise */
    } finally {
      setBusy(null);
    }
  }

  const options = [
    { kind: "docx", label: "Word (.docx)" },
    { kind: "pdf", label: "PDF (.pdf)" },
    // Excel only makes sense if the reply actually has tabular data.
    ...(hasMarkdownTable(content) ? [{ kind: "xlsx", label: "Excel (.xlsx)" }] : []),
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

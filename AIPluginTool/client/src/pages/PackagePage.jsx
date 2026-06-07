import { useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { useToast } from "../components/ui/ToastProvider.jsx";

const STATUS_LABEL = { added: "Added", removed: "Removed", changed: "Changed", same: "Same" };

function PackageDiff({ compare, fileNameA, selected, onSelect, prettify }) {
  const changed = compare.statuses.filter((s) => s.status !== "same");
  const counts = {
    added: changed.filter((s) => s.status === "added").length,
    removed: changed.filter((s) => s.status === "removed").length,
    changed: changed.filter((s) => s.status === "changed").length,
  };
  const sel = compare.statuses.find((s) => s.path === selected) ?? null;
  const a = sel ? compare.textsA.get(sel.path) : null;
  const b = sel ? compare.textsB.get(sel.path) : null;

  return (
    <div className="cia-pkg-diff">
      <div className="cia-pkg-diff-summary">
        <span className="cia-pkg-diff-files">
          {fileNameA} <span aria-hidden="true">↔</span> {compare.fileNameB}
        </span>
        <span className="cia-pkg-badge added">+{counts.added}</span>
        <span className="cia-pkg-badge removed">−{counts.removed}</span>
        <span className="cia-pkg-badge changed">~{counts.changed}</span>
      </div>

      {changed.length === 0 ? (
        <p className="cia-forum-muted">The two packages are identical.</p>
      ) : (
        <div className="cia-pkg-body">
          <aside className="cia-pkg-tree">
            {changed.map((s) => (
              <button
                key={s.path}
                type="button"
                className={`cia-pkg-entry${selected === s.path ? " active" : ""}`}
                onClick={() => onSelect(s.path)}
                title={s.path}
              >
                <span className="cia-pkg-entry-name">
                  <span className={`cia-pkg-badge ${s.status}`}>{STATUS_LABEL[s.status][0]}</span>
                  {s.path.replace(/^package\//, "")}
                </span>
              </button>
            ))}
          </aside>

          <section className="cia-pkg-viewer">
            {!sel ? (
              <p className="cia-forum-muted">Select an entry to see the difference.</p>
            ) : sel.status === "changed" ? (
              <div className="cia-pkg-diff-cols">
                <div>
                  <div className="cia-pkg-diff-col-head">A · {fileNameA}</div>
                  <pre className="cia-pkg-code">{prettify(sel.path, a)}</pre>
                </div>
                <div>
                  <div className="cia-pkg-diff-col-head">B · {compare.fileNameB}</div>
                  <pre className="cia-pkg-code">{prettify(sel.path, b)}</pre>
                </div>
              </div>
            ) : (
              <>
                <div className="cia-pkg-viewer-head">
                  <span className="cia-pkg-viewer-path">{sel.path.replace(/^package\//, "")}</span>
                  <span className={`cia-pkg-badge ${sel.status}`}>{STATUS_LABEL[sel.status]}</span>
                </div>
                <pre className="cia-pkg-code">{prettify(sel.path, sel.status === "added" ? b : a)}</pre>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function prettyJson(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function prettyXml(xml) {
  const PAD = "  ";
  let pad = 0;
  return xml
    .replace(/>\s*</g, ">\n<")
    .split("\n")
    .map((node) => {
      if (/^<\/\w/.test(node)) pad = Math.max(pad - 1, 0);
      const line = PAD.repeat(pad) + node;
      if (/^<\w[^>]*[^/]>$/.test(node) && !/<\/\w/.test(node)) pad += 1;
      return line;
    })
    .join("\n")
    .trim();
}

function fmtSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Sort: package_index + root first, then data, then attachments, then the rest.
function rank(path) {
  if (/package_index\.json$/.test(path)) return 0;
  if (/\/root\.json$/.test(path)) return 1;
  if (/\/data\//.test(path)) return 2;
  if (/\/attachments\//.test(path)) return 3;
  return 4;
}

export function PackagePage() {
  const toast = useToast();
  const fileRef = useRef(null);
  const compareRef = useRef(null);
  const zipRef = useRef(null);
  const [compare, setCompare] = useState(null); // { fileNameB, statuses[], textsA, textsB }
  const [selectedDiff, setSelectedDiff] = useState(null);
  const [fileName, setFileName] = useState("");
  const [entries, setEntries] = useState([]);
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [editing, setEditing] = useState(false);
  // Edited entry text keyed by path; only these get written back on export.
  const [drafts, setDrafts] = useState({});

  const loadFile = async (file) => {
    try {
      const zip = await JSZip.loadAsync(file);
      zipRef.current = zip;
      const list = [];
      zip.forEach((path, entry) => {
        if (entry.dir) return;
        list.push({ path, size: entry._data?.uncompressedSize ?? 0 });
      });
      list.sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
      setEntries(list);
      setFileName(file.name);
      setSelected(null);
      setContent(null);
      setDrafts({});
      setEditing(false);
      toast.success(`Imported TechnologyOne package — ${list.length} entries`);
      if (list.length) void openEntry(list[0].path);
    } catch (error) {
      toast.error(error.message || "Couldn't read the package (is it a .t1pkg?)");
    }
  };

  const openEntry = async (path) => {
    setSelected(path);
    const ext = path.split(".").pop()?.toLowerCase();
    const kind = ext === "json" ? "json" : ext === "xml" ? "xml" : "text";
    if (drafts[path] != null) {
      setContent({ kind, text: drafts[path] });
      return;
    }
    try {
      const raw = await zipRef.current.file(path).async("string");
      if (kind === "json") setContent({ kind, text: prettyJson(raw) });
      else if (kind === "xml") setContent({ kind, text: prettyXml(raw) });
      else setContent({ kind, text: raw.slice(0, 200_000) });
    } catch {
      setContent({ kind: "text", text: "(Could not read this entry as text)" });
    }
  };

  const editDraft = (value) => {
    setContent((c) => (c ? { ...c, text: value } : c));
    setDrafts((d) => ({ ...d, [selected]: value }));
  };

  // Re-export the package: keep every original entry/path, write back only edits.
  const downloadPackage = async () => {
    const zip = zipRef.current;
    if (!zip) return;
    try {
      for (const [path, text] of Object.entries(drafts)) {
        if (text != null) zip.file(path, text);
      }
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName || "package.t1pkg";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Package exported (original structure preserved)");
    } catch (error) {
      toast.error(error.message || "Couldn't export the package");
    }
  };

  const readAll = async (zip) => {
    const map = new Map();
    const names = [];
    zip.forEach((p, e) => {
      if (!e.dir) names.push(p);
    });
    for (const p of names) map.set(p, await zip.file(p).async("string"));
    return map;
  };

  const loadCompare = async (file) => {
    if (!zipRef.current) return;
    try {
      const zipB = await JSZip.loadAsync(file);
      const [textsA, textsB] = await Promise.all([readAll(zipRef.current), readAll(zipB)]);
      const paths = [...new Set([...textsA.keys(), ...textsB.keys()])].sort(
        (a, b) => rank(a) - rank(b) || a.localeCompare(b),
      );
      const statuses = paths.map((path) => {
        const a = textsA.get(path);
        const b = textsB.get(path);
        const status = a == null ? "added" : b == null ? "removed" : a === b ? "same" : "changed";
        return { path, status };
      });
      setCompare({ fileNameB: file.name, statuses, textsA, textsB });
      setSelectedDiff(statuses.find((s) => s.status !== "same")?.path ?? null);
      toast.success("Comparison ready");
    } catch (error) {
      toast.error(error.message || "Couldn't read the comparison package");
    }
  };

  const prettify = (path, raw) => {
    if (raw == null) return "";
    const ext = path.split(".").pop()?.toLowerCase();
    if (ext === "json") return prettyJson(raw);
    if (ext === "xml") return prettyXml(raw);
    return raw.slice(0, 200_000);
  };

  const copyContent = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content.text);
      toast.success("Copied");
    } catch {
      /* ignore */
    }
  };

  const grouped = useMemo(() => {
    const g = { Manifest: [], Data: [], Attachments: [], Other: [] };
    for (const e of entries) {
      if (rank(e.path) <= 1) g.Manifest.push(e);
      else if (rank(e.path) === 2) g.Data.push(e);
      else if (rank(e.path) === 3) g.Attachments.push(e);
      else g.Other.push(e);
    }
    return g;
  }, [entries]);

  return (
    <div
      className={`cia-pkg-page t1-animate-in${dragActive ? " is-drag" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void loadFile(f);
      }}
    >
      {dragActive ? <div className="cia-pkg-dropmask">Drop the .t1pkg to open</div> : null}

      <div className="cia-pkg-header">
        <div>
          <h1>Package Inspector</h1>
          <p>Open a TechnologyOne .t1pkg and browse its records (read-only).</p>
        </div>
        <div className="cia-pkg-actions">
          <input
            ref={fileRef}
            type="file"
            accept=".t1pkg,.zip,application/zip"
            className="cia-file-input-hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadFile(f);
              e.target.value = "";
            }}
          />
          <button type="button" className="cia-header-btn" onClick={() => fileRef.current?.click()}>
            {entries.length ? "Import another" : "Import"}
          </button>
          {entries.length ? (
            <>
              <input
                ref={compareRef}
                type="file"
                accept=".t1pkg,.zip,application/zip"
                className="cia-file-input-hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void loadCompare(f);
                  e.target.value = "";
                }}
              />
              {compare ? (
                <button type="button" className="cia-header-btn" onClick={() => setCompare(null)}>
                  Exit compare
                </button>
              ) : (
                <button type="button" className="cia-header-btn" onClick={() => compareRef.current?.click()}>
                  Compare…
                </button>
              )}
            </>
          ) : null}
          {content ? (
            <>
              <button
                type="button"
                className={`cia-header-btn${editing ? " active" : ""}`}
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? "Viewing" : "Edit"}
              </button>
              <button type="button" className="cia-header-btn" onClick={() => void copyContent()}>
                Copy
              </button>
            </>
          ) : null}
          {entries.length ? (
            <button
              type="button"
              className="cia-header-btn"
              onClick={() => void downloadPackage()}
              title="Re-export keeping the original package structure"
            >
              Export .t1pkg
              {Object.keys(drafts).length ? ` (${Object.keys(drafts).length})` : ""}
            </button>
          ) : null}
        </div>
      </div>

      {compare ? (
        <PackageDiff
          compare={compare}
          fileNameA={fileName}
          selected={selectedDiff}
          onSelect={setSelectedDiff}
          prettify={prettify}
        />
      ) : !entries.length ? (
        <div className="cia-pkg-empty">
          <p>
            <strong>Drag &amp; drop</strong> a <code>.t1pkg</code> here (or use Open). It's a ZIP of
            JSON/XML records — this lists every entry and pretty-prints its contents.
          </p>
        </div>
      ) : (
        <div className="cia-pkg-body">
          <aside className="cia-pkg-tree">
            <div className="cia-pkg-filename">{fileName}</div>
            {Object.entries(grouped).map(([group, items]) =>
              items.length ? (
                <div key={group} className="cia-pkg-group">
                  <div className="cia-pkg-group-title">
                    {group} <span>{items.length}</span>
                  </div>
                  {items.map((e) => (
                    <button
                      key={e.path}
                      type="button"
                      className={`cia-pkg-entry${selected === e.path ? " active" : ""}`}
                      onClick={() => void openEntry(e.path)}
                      title={e.path}
                    >
                      <span className="cia-pkg-entry-name">
                        {drafts[e.path] != null ? <span className="cia-pkg-edited">●</span> : null}
                        {e.path.replace(/^package\//, "")}
                      </span>
                      <span className="cia-pkg-entry-size">{fmtSize(e.size)}</span>
                    </button>
                  ))}
                </div>
              ) : null,
            )}
          </aside>

          <section className="cia-pkg-viewer">
            {content ? (
              <>
                <div className="cia-pkg-viewer-head">
                  <span className="cia-pkg-viewer-path">{selected?.replace(/^package\//, "")}</span>
                  <span className="cia-pkg-viewer-kind">{content.kind.toUpperCase()}</span>
                </div>
                {editing ? (
                  <textarea
                    className="cia-pkg-code cia-pkg-editor"
                    value={content.text}
                    spellCheck={false}
                    onChange={(e) => editDraft(e.target.value)}
                  />
                ) : (
                  <pre className="cia-pkg-code">{content.text}</pre>
                )}
              </>
            ) : (
              <p className="cia-forum-muted">Select an entry to view it.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

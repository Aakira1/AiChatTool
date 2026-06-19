import { useEffect, useMemo, useRef, useState } from "react";
import {
  parseCsv,
  toCsv,
  analyzeChecklist,
  groupItems,
  fgItems,
  progressOf,
  statusState,
  nextStatusState,
  STATUS_TEXT,
  todayIso,
} from "../../lib/checklist.js";
import { getStored, setStored } from "../../lib/storage.js";

const STORAGE_KEY = "cia.ext.checklist.v3";   // legacy localStorage (migrated)
const ORIG_KEY = "cia.ext.checklist.orig.v1"; // legacy localStorage (migrated)
// chrome.storage.local keys — shared across every screen, NOT partitioned.
const CHK_KEY = "checklistData"; // { sheets, fileName }
const CHK_ORIG_KEY = "checklistOrig"; // base64 of the imported .xlsx

const STATUS_META = {
  "not-started": { dot: "○", label: "To do", cls: "todo" },
  "in-progress": { dot: "◐", label: "In progress", cls: "wip" },
  completed: { dot: "●", label: "Done", cls: "done" },
};

function buildStages(sheets) {
  const stages = [];
  for (const sheet of sheets) {
    const analysis = analyzeChecklist(sheet.rows);
    if (analysis) {
      stages.push({
        name: sheet.name,
        rows: sheet.rows,
        analysis,
        rowOffset: sheet.rowOffset ?? 0,
        colOffset: sheet.colOffset ?? 0,
      });
    }
  }
  return stages;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 1:1 format-preserving Excel export ───────────────────────────────────────
// The community `xlsx` writer drops all styling, so instead we edit the ORIGINAL
// workbook's XML in place — only rewriting the changed status/date/notes cells
// (as inline strings, keeping each cell's style index). Everything else — fills,
// fonts, colours, column widths, merges, theme — is left byte-for-byte intact.

function colLetter(c) {
  let s = "";
  let n = c + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
function colToNum(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
function xmlEscape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function bytesToBase64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < arr.length; i += 0x8000) bin += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
  return btoa(bin);
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  return arr;
}

// Replace (or insert) a single cell in a worksheet XML string, preserving style.
function setCellInSheetXml(xml, addr, value, rowNum) {
  const re = new RegExp(`<c r="${addr}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  const m = xml.match(re);
  const sAttr = m ? (m[1].match(/\ss="\d+"/)?.[0] || "") : "";
  const hasVal = value !== "" && value != null;
  const cell = hasVal
    ? `<c r="${addr}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
    : `<c r="${addr}"${sAttr}/>`;
  if (m) return xml.replace(re, cell);

  // Cell missing — insert into its row in column order (rare for tool exports).
  const rowRe = new RegExp(`(<row r="${rowNum}"[^>]*>)([\\s\\S]*?)(</row>)`);
  const rm = xml.match(rowRe);
  if (!rm) return xml;
  const colNum = colToNum(addr.match(/[A-Z]+/)[0]);
  let insertAt = rm[2].length;
  for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"[\s\S]*?(?:\/>|<\/c>)/g)) {
    if (colToNum(cm[1]) > colNum) { insertAt = cm.index; break; }
  }
  const inner = rm[2].slice(0, insertAt) + cell + rm[2].slice(insertAt);
  return xml.replace(rowRe, `${rm[1]}${inner}${rm[3]}`);
}

async function exportPreservingFormat(originalBytes, stages) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(originalBytes);

  // Map each sheet name to its worksheet XML path.
  const wbXml = await zip.file("xl/workbook.xml").async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const relMap = {};
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2];
  const nameToPath = {};
  for (const m of wbXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const name = m[0].match(/name="([^"]+)"/)?.[1];
    const rid = m[0].match(/r:id="([^"]+)"/)?.[1];
    if (!name || !rid) continue;
    let target = relMap[rid];
    if (target) {
      target = target.replace(/^\//, "");
      if (!target.startsWith("xl/")) target = `xl/${target}`;
      nameToPath[name] = target;
    }
  }

  for (const s of stages) {
    const path = nameToPath[s.name] || "xl/worksheets/sheet1.xml";
    const f = zip.file(path);
    if (!f) continue;
    let xml = await f.async("string");
    const { cols } = s.analysis;
    const r0 = s.rowOffset ?? 0;
    const c0 = s.colOffset ?? 0;

    // Collect the cells to change (status / date / notes for every task row).
    const changes = new Map();
    for (const item of s.analysis.items) {
      const rowNum = r0 + item.rowIndex + 1;
      [cols.status, cols.date, cols.notes].forEach((col) => {
        if (col >= 0) changes.set(colLetter(c0 + col) + rowNum, s.rows[item.rowIndex][col]);
      });
    }

    // One pass: rewrite only the target cells, keeping their style index `s`.
    const seen = new Set();
    xml = xml.replace(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g, (full, addr, attrs) => {
      if (!changes.has(addr)) return full;
      seen.add(addr);
      const sAttr = attrs.match(/\ss="\d+"/)?.[0] || "";
      const value = changes.get(addr);
      return value !== "" && value != null
        ? `<c r="${addr}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
        : `<c r="${addr}"${sAttr}/>`;
    });

    // Insert any target cell that didn't already exist (rare).
    for (const [addr, value] of changes) {
      if (seen.has(addr)) continue;
      xml = setCellInSheetXml(xml, addr, value, parseInt(addr.match(/\d+/)[0], 10));
    }

    zip.file(path, xml);
  }

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function ChecklistPanel({ onClose }) {
  const fileRef = useRef(null);
  const [stages, setStages] = useState(null);
  const [activeStage, setActiveStage] = useState(0);
  const [fileName, setFileName] = useState("");
  const [tick, setTick] = useState(0);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(""); // "" | not-started | in-progress | completed
  const [consultantFilter, setConsultantFilter] = useState(""); // schedule resource / responsible value
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set()); // empty = all collapsed
  const [expanded, setExpanded] = useState(null); // rowIndex of open detail
  const [exporting, setExporting] = useState(false);
  const originalRef = useRef(null); // Uint8Array of the imported .xlsx (for 1:1 export)

  // Persist to chrome.storage.local — shared across every screen (side panel,
  // floating widget, popout) and NOT partitioned per-website like localStorage.
  const persist = (nextStages, name) => {
    const sheets = nextStages.map((s) => ({ name: s.name, rows: s.rows, rowOffset: s.rowOffset, colOffset: s.colOffset }));
    void setStored({ [CHK_KEY]: { sheets, fileName: name } });
  };

  useEffect(() => {
    (async () => {
      const store = await getStored([CHK_KEY, CHK_ORIG_KEY]);
      let data = store[CHK_KEY];
      let origB64 = store[CHK_ORIG_KEY];

      // One-time migration from the old per-site localStorage store.
      if (!data?.sheets?.length) {
        try {
          const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
          if (legacy?.sheets?.length) {
            data = legacy;
            void setStored({ [CHK_KEY]: legacy });
          }
        } catch { /* ignore */ }
      }
      if (!origB64) {
        try {
          const legacyOrig = localStorage.getItem(ORIG_KEY);
          if (legacyOrig) { origB64 = legacyOrig; void setStored({ [CHK_ORIG_KEY]: legacyOrig }); }
        } catch { /* ignore */ }
      }

      if (data?.sheets?.length) {
        const local = buildStages(data.sheets);
        if (local.length) {
          setStages(local);
          setFileName(data.fileName || "checklist.csv");
        }
      }
      if (origB64) {
        try { originalRef.current = base64ToBytes(origB64); } catch { /* ignore */ }
      }
    })();
  }, []);

  const apply = (nextStages, name) => {
    setStages(nextStages);
    setActiveStage((i) => Math.min(i, nextStages.length - 1));
    setFileName(name || "checklist.csv");
    setTick((t) => t + 1);
  };

  const loadFile = async (file) => {
    try {
      let nextStages;
      if (/\.xlsx?$/i.test(file.name)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const XLSX = await import("xlsx");
        const wb = XLSX.read(bytes, { type: "array" });
        const sheets = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name];
          const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
          return {
            name,
            rows: XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }),
            rowOffset: range.s.r,
            colOffset: range.s.c,
          };
        });
        nextStages = buildStages(sheets);
        // Keep the raw workbook so export can preserve its formatting 1:1.
        originalRef.current = bytes;
        void setStored({ [CHK_ORIG_KEY]: bytesToBase64(bytes) });
        try { localStorage.removeItem(ORIG_KEY); } catch { /* ignore */ }
      } else {
        nextStages = buildStages([{ name: "Checklist", rows: parseCsv(await file.text()) }]);
        originalRef.current = null;
        void setStored({ [CHK_ORIG_KEY]: null });
      }
      if (!nextStages.length) {
        setError("Couldn't find a Functional Group / Task / Status layout in that file.");
        return;
      }
      setActiveStage(0);
      apply(nextStages, file.name);
      setError("");
      persist(nextStages, file.name);
    } catch (e) {
      setError(e.message || "Failed to read the file");
    }
  };

  const stage = stages?.[activeStage] ?? null;

  const writeCell = (item, colKey, value) => {
    if (!stage) return;
    const { cols } = stage.analysis;
    const col = cols[colKey];
    if (col >= 0) {
      stage.rows[item.rowIndex][col] = value;
      item[colKey] = value;
    }
  };

  const setItemStatus = (item, stateId) => {
    if (!stage) return;
    const { cols } = stage.analysis;
    const r = stage.rows[item.rowIndex];
    if (cols.status >= 0) r[cols.status] = STATUS_TEXT[stateId];
    if (cols.date >= 0) {
      if (stateId === "completed" && !r[cols.date]) r[cols.date] = todayIso();
      if (stateId === "not-started") r[cols.date] = "";
    }
    item.status = cols.status >= 0 ? r[cols.status] : item.status;
    item.date = cols.date >= 0 ? r[cols.date] : item.date;
    persist(stages, fileName);
    setTick((t) => t + 1);
  };

  const cycleStatus = (item) => setItemStatus(item, nextStatusState(statusState(item.status)));

  const allItems = stage ? stage.analysis.items : [];

  // "Consultant type" comes from the Investment Schedule Resource column when
  // present, otherwise the Responsible column.
  const consultantField = useMemo(
    () => (allItems.some((it) => it.scheduleResource) ? "scheduleResource" : "responsible"),
    [stage, tick], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const consultantOptions = useMemo(() => {
    const set = new Set();
    allItems.forEach((it) => { const v = (it[consultantField] || "").trim(); if (v) set.add(v); });
    return [...set].sort();
  }, [stage, tick, consultantField]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeFilterCount = (consultantFilter ? 1 : 0) + (stages && stages.length > 1 ? 1 : 0) * 0;

  // Filtered + grouped view.
  const groups = useMemo(() => {
    if (!stage) return [];
    const q = search.trim().toLowerCase();
    const filtered = allItems.filter((it) => {
      if (statusFilter && statusState(it.status) !== statusFilter) return false;
      if (consultantFilter && (it[consultantField] || "").trim() !== consultantFilter) return false;
      if (q) {
        const hay = `${it.task} ${it.notes} ${it.responsible} ${it.taskGroup} ${it.functionalGroup}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return groupItems(filtered);
  }, [stage, tick, search, statusFilter, consultantFilter, consultantField]); // eslint-disable-line react-hooks/exhaustive-deps

  const overall = useMemo(
    () => (stages ? progressOf(stages.flatMap((s) => s.analysis.items)) : null),
    [stages, tick],
  );

  // Up Next: first not-completed item that matches the active filters, so the
  // default "✓ Complete" card tracks the consultant-type (and search) filter
  // chosen below instead of always showing the first task in the whole stage.
  const upNext = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (
      allItems.find((it) => {
        if (statusState(it.status) === "completed") return false;
        if (consultantFilter && (it[consultantField] || "").trim() !== consultantFilter) return false;
        if (q) {
          const hay = `${it.task} ${it.notes} ${it.responsible} ${it.taskGroup} ${it.functionalGroup}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }) ?? null
    );
  }, [stage, tick, consultantFilter, consultantField, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = (name) =>
    setExpandedGroups((cur) => {
      const next = new Set(cur);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const exportCsv = () => {
    const base = fileName.replace(/\.(csv|xlsx?)$/i, "");
    downloadBlob(
      new Blob([toCsv(stage.rows)], { type: "text/csv;charset=utf-8" }),
      `${base}${stages.length > 1 ? `-${stage.name}` : ""}-updated.csv`,
    );
  };

  const exportXlsx = async () => {
    setExporting(true);
    setError("");
    try {
      const base = fileName.replace(/\.(csv|xlsx?)$/i, "");
      // Preferred path: edit the original workbook in place → keeps formatting 1:1.
      // Recover the original from storage if the in-memory copy was lost.
      if (!originalRef.current) {
        const b64 = (await getStored([CHK_ORIG_KEY]))[CHK_ORIG_KEY];
        if (b64) { try { originalRef.current = base64ToBytes(b64); } catch { /* ignore */ } }
      }
      if (originalRef.current) {
        try {
          const blob = await exportPreservingFormat(originalRef.current, stages);
          downloadBlob(blob, `${base}-updated.xlsx`);
          return;
        } catch (e) {
          console.warn("[checklist] format-preserving export failed, falling back", e);
        }
      } else if (/\.xlsx?$/i.test(fileName)) {
        // Was an Excel import but the original is gone — warn instead of degrading.
        setError("Re-import the Excel file to export with its original formatting (1:1). A plain copy was downloaded.");
      }
      // Fallback (CSV imports, or if surgery fails): plain workbook, no styling.
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      stages.forEach((s, i) => {
        const ws = XLSX.utils.aoa_to_sheet(s.rows);
        XLSX.utils.book_append_sheet(wb, ws, (s.name || `Sheet${i + 1}`).slice(0, 31));
      });
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      downloadBlob(
        new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `${base}-updated.xlsx`,
      );
    } finally {
      setExporting(false);
    }
  };

  const clearSession = () => {
    setStages(null);
    setActiveStage(0);
    setFileName("");
    setSearch("");
    setStatusFilter("");
    originalRef.current = null;
    void setStored({ [CHK_KEY]: null, [CHK_ORIG_KEY]: null });
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(ORIG_KEY); } catch { /* ignore */ }
  };

  return (
    <div className="cia-ext-settings-overlay" role="dialog" aria-label="Companion checklist">
      <div className="cia-ext-settings-header">
        <strong>✅ Companion</strong>
        <button type="button" className="cia-ext-icon-btn" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div
        className={`cia-ext-settings-body cia-ext-chk${dragActive ? " is-drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragActive(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void loadFile(f);
        }}
      >
        {error ? <p className="cia-ext-banner cia-ext-banner-error">{error}</p> : null}

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ""; }}
        />

        {!stages ? (
          <div className="cia-ext-chk-empty">
            <div className="cia-ext-chk-empty-icon">📋</div>
            <p>Import an implementation companion (CSV or Excel) to track progress.</p>
            <button type="button" className="cia-ext-primary-btn" onClick={() => fileRef.current?.click()}>
              Import checklist
            </button>
            <small>…or drag &amp; drop a file anywhere here.</small>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="cia-ext-chk-toolbar">
              <button type="button" className="cia-ext-secondary-btn" onClick={() => fileRef.current?.click()}>Import</button>
              <button type="button" className="cia-ext-secondary-btn" onClick={exportCsv}>CSV</button>
              <button type="button" className="cia-ext-secondary-btn" onClick={() => void exportXlsx()} disabled={exporting}>
                {exporting ? "…" : "Excel"}
              </button>
              <button type="button" className="cia-ext-link-danger" onClick={clearSession}>Clear</button>
            </div>

            {/* Overall progress */}
            <div className="cia-ext-chk-summary">
              <span>{overall.completed}/{overall.total} done · {overall.inProgress} in progress</span>
              <div className="cia-ext-chk-bar"><div className="cia-ext-chk-bar-fill" style={{ width: `${overall.pct}%` }} /></div>
            </div>

            {/* Stage tabs */}
            {stages.length > 1 ? (
              <div className="cia-ext-chk-stages">
                {stages.map((s, i) => {
                  const p = progressOf(s.analysis.items);
                  return (
                    <button
                      key={s.name}
                      type="button"
                      className={`cia-ext-chk-stage-tab${i === activeStage ? " is-active" : ""}`}
                      onClick={() => { setActiveStage(i); setExpanded(null); }}
                    >
                      {s.name} · {p.pct}%
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Up Next */}
            {upNext ? (
              <div className="cia-ext-chk-upnext">
                <div className="cia-ext-chk-upnext-top">
                  <span className="cia-ext-chk-upnext-label">Up next</span>
                  <span className={`cia-ext-chk-upnext-status is-${STATUS_META[statusState(upNext.status)].cls}`}>
                    {STATUS_META[statusState(upNext.status)].label}
                  </span>
                  <button type="button" className="cia-ext-primary-btn cia-ext-chk-upnext-btn" onClick={() => setItemStatus(upNext, "completed")}>
                    ✓ Complete
                  </button>
                </div>

                {(upNext.functionalGroup || upNext.taskGroup) ? (
                  <div className="cia-ext-chk-upnext-crumb">
                    {[upNext.functionalGroup, upNext.taskGroup].filter((x) => x && x !== "—").join(" › ")}
                  </div>
                ) : null}

                <div className="cia-ext-chk-upnext-task">{upNext.task}</div>

                {(upNext.responsible || upNext.scheduleResource || upNext.date) ? (
                  <div className="cia-ext-chk-upnext-meta">
                    {upNext.responsible ? <span title="Responsible">👤 {upNext.responsible}</span> : null}
                    {upNext.scheduleResource ? <span title="Consultant type">🧩 {upNext.scheduleResource}</span> : null}
                    {upNext.date ? <span title="Target / completed date">📅 {upNext.date}</span> : null}
                  </div>
                ) : null}

                {upNext.notes ? <div className="cia-ext-chk-upnext-note">📝 {upNext.notes}</div> : null}
              </div>
            ) : null}

            {/* Filters */}
            <div className="cia-ext-chk-filters">
              <input
                className="cia-ext-chk-search"
                placeholder="Search tasks…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select className="cia-ext-chk-statusfilter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All</option>
                <option value="not-started">To do</option>
                <option value="in-progress">In progress</option>
                <option value="completed">Done</option>
              </select>

              <div className="cia-ext-chk-filter-wrap">
                <button
                  type="button"
                  className={`cia-ext-chk-filter-btn${activeFilterCount ? " is-active" : ""}`}
                  onClick={() => setFilterOpen((v) => !v)}
                  title="More filters"
                  aria-label="More filters"
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path d="M1.5 2h13l-5 6v4.5l-3 1.5V8z" fill="currentColor" />
                  </svg>
                  {activeFilterCount ? <span className="cia-ext-chk-filter-badge">{activeFilterCount}</span> : null}
                </button>

                {filterOpen ? (
                  <>
                    <div className="cia-ext-chk-filter-backdrop" onClick={() => setFilterOpen(false)} />
                    <div className="cia-ext-chk-filter-pop" role="menu">
                      {stages.length > 1 ? (
                        <label className="cia-ext-chk-filter-field">
                          <span>Stage</span>
                          <select value={activeStage} onChange={(e) => { setActiveStage(Number(e.target.value)); setExpanded(null); }}>
                            {stages.map((s, i) => (
                              <option key={s.name} value={i}>{s.name}</option>
                            ))}
                          </select>
                        </label>
                      ) : null}

                      {consultantOptions.length > 0 ? (
                        <label className="cia-ext-chk-filter-field">
                          <span>Consultant type</span>
                          <select value={consultantFilter} onChange={(e) => setConsultantFilter(e.target.value)}>
                            <option value="">All</option>
                            {consultantOptions.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <p className="cia-ext-chk-filter-empty">No consultant/resource column in this file.</p>
                      )}

                      {consultantFilter ? (
                        <button type="button" className="cia-ext-chk-filter-clear" onClick={() => setConsultantFilter("")}>
                          Clear filters
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            {/* Groups */}
            {groups.length === 0 ? (
              <p className="cia-ext-forum-muted">No tasks match your filters.</p>
            ) : (
              groups.map((fg) => {
                const fp = progressOf(fgItems(fg));
                // Collapsed by default; auto-expand while searching/filtering so matches show.
                const forceExpand = Boolean(search.trim() || statusFilter || consultantFilter);
                const isCollapsed = !forceExpand && !expandedGroups.has(fg.name);
                return (
                  <section key={fg.name} className="cia-ext-chk-group">
                    <button className="cia-ext-chk-group-head" onClick={() => toggleGroup(fg.name)}>
                      <span className="cia-ext-chk-group-caret">{isCollapsed ? "▸" : "▾"}</span>
                      <strong>{fg.name}</strong>
                      <span className="cia-ext-chk-group-count">{fp.completed}/{fp.total}</span>
                      <span className="cia-ext-chk-group-bar"><span style={{ width: `${fp.pct}%` }} /></span>
                    </button>

                    {!isCollapsed && fg.taskGroups.map((tg) => (
                      <div key={tg.name} className="cia-ext-chk-tg">
                        {tg.name && tg.name !== "—" ? <div className="cia-ext-chk-tg-name">{tg.name}</div> : null}
                        <ul className="cia-ext-chk-tasks">
                          {tg.items.map((item) => {
                            const state = statusState(item.status);
                            const meta = STATUS_META[state];
                            const hasDetail = item.responsible || item.date || item.notes || item.scheduleResource || item.links;
                            const open = expanded === item.rowIndex;
                            return (
                              <li key={item.rowIndex} className={`cia-ext-chk-task is-${state}`}>
                                <div className="cia-ext-chk-task-row">
                                  <button
                                    type="button"
                                    className={`cia-ext-chk-statusdot is-${meta.cls}`}
                                    onClick={() => cycleStatus(item)}
                                    title={`${meta.label} — click to change`}
                                  >
                                    {meta.dot}
                                  </button>
                                  <span className="cia-ext-chk-task-title" onClick={() => cycleStatus(item)}>
                                    {item.task}
                                  </span>
                                  {hasDetail ? (
                                    <button
                                      type="button"
                                      className="cia-ext-chk-task-expand"
                                      onClick={() => setExpanded(open ? null : item.rowIndex)}
                                      aria-label="Details"
                                    >
                                      {open ? "▾" : "⋯"}
                                    </button>
                                  ) : null}
                                </div>

                                {open ? (
                                  <div className="cia-ext-chk-task-detail">
                                    {item.responsible ? <div><b>Responsible:</b> {item.responsible}</div> : null}
                                    {item.scheduleResource ? <div><b>Schedule:</b> {item.scheduleResource}</div> : null}
                                    {item.date ? <div><b>Completed:</b> {item.date}</div> : null}
                                    {item.links ? <div><b>Links:</b> {item.links}</div> : null}
                                    <label className="cia-ext-chk-notes-label">
                                      Notes
                                      <textarea
                                        className="cia-ext-chk-notes"
                                        defaultValue={item.notes}
                                        placeholder="Add a note…"
                                        onBlur={(e) => { writeCell(item, "notes", e.target.value); persist(stages, fileName); }}
                                      />
                                    </label>
                                  </div>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </section>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}

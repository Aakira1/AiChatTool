import { useEffect, useMemo, useRef, useState } from "react";
import { parseCsv, toCsv } from "../../lib/checklist.js";
import {
  analyzeRunSheet,
  groupByPhase,
  progressOf,
  statusState,
  nextStatusState,
  ownerField,
  STATUS_TEXT,
  todayIso,
  exportPreservingFormat,
  bytesToBase64,
  base64ToBytes,
} from "../../lib/goLive.js";
import { getStored, setStored } from "../../lib/storage.js";

// chrome.storage.local keys — shared across every screen of the plugin.
const GL_KEY = "goLiveData"; // { sheets, fileName, notes }
const GL_ORIG_KEY = "goLiveOrig"; // base64 of the imported .xlsx

const STATUS_META = {
  "not-started": { dot: "○", label: "To do", cls: "todo" },
  "in-progress": { dot: "◐", label: "In progress", cls: "wip" },
  completed: { dot: "●", label: "Done", cls: "done" },
};

function buildStages(sheets) {
  const stages = [];
  for (const sheet of sheets) {
    const analysis = analyzeRunSheet(sheet.rows);
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

export function GoLivePanel({ onClose }) {
  const fileRef = useRef(null);
  const [stages, setStages] = useState(null);
  const [activeStage, setActiveStage] = useState(0);
  const [fileName, setFileName] = useState("");
  const [tick, setTick] = useState(0);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [collapsedPhases, setCollapsedPhases] = useState(() => new Set());
  const [exporting, setExporting] = useState(false);
  const originalRef = useRef(null);

  const persist = (nextStages, name) => {
    const sheets = nextStages.map((s) => ({ name: s.name, rows: s.rows, rowOffset: s.rowOffset, colOffset: s.colOffset }));
    void setStored({ [GL_KEY]: { sheets, fileName: name } });
  };

  useEffect(() => {
    (async () => {
      const store = await getStored([GL_KEY, GL_ORIG_KEY]);
      const data = store[GL_KEY];
      const origB64 = store[GL_ORIG_KEY];
      if (data?.sheets?.length) {
        const local = buildStages(data.sheets);
        if (local.length) {
          setStages(local);
          setFileName(data.fileName || "go-live.xlsx");
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
    setFileName(name || "go-live.xlsx");
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
        originalRef.current = bytes;
        void setStored({ [GL_ORIG_KEY]: bytesToBase64(bytes) });
      } else {
        nextStages = buildStages([{ name: "Run Sheet", rows: parseCsv(await file.text()) }]);
        originalRef.current = null;
        void setStored({ [GL_ORIG_KEY]: null });
      }
      if (!nextStages.length) {
        setError("Couldn't find a go-live run sheet (Task / Status columns) in that file.");
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
  const allItems = stage ? stage.analysis.items : [];

  const ownerKey = useMemo(() => ownerField(allItems), [stage, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const ownerOptions = useMemo(() => {
    const set = new Set();
    allItems.forEach((it) => { const v = (it[ownerKey] || "").trim(); if (v) set.add(v); });
    return [...set].sort();
  }, [stage, tick, ownerKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const categoryOptions = useMemo(() => {
    const set = new Set();
    allItems.forEach((it) => { if (it.category) set.add(it.category); });
    return [...set].sort();
  }, [stage, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = (it) => {
    if (statusFilter && statusState(it.status) !== statusFilter) return false;
    if (ownerFilter && (it[ownerKey] || "").trim() !== ownerFilter) return false;
    if (categoryFilter && it.category !== categoryFilter) return false;
    const q = search.trim().toLowerCase();
    if (q) {
      const hay = `${it.task} ${it.notes} ${it.category} ${it.owner} ${it.resource} ${it.assignee} ${it.phase}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  const phases = useMemo(() => {
    if (!stage) return [];
    return groupByPhase(allItems.filter(matches));
  }, [stage, tick, search, statusFilter, ownerFilter, categoryFilter, ownerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const overall = useMemo(() => progressOf(allItems), [stage, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Up next: first incomplete task that matches the active filters.
  const upNext = useMemo(
    () => allItems.find((it) => statusState(it.status) !== "completed" && matches(it)) ?? null,
    [stage, tick, search, statusFilter, ownerFilter, categoryFilter, ownerKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const setItemStatus = (item, stateId) => {
    if (!stage) return;
    const { cols } = stage.analysis;
    const r = stage.rows[item.rowIndex];
    if (cols.status >= 0) r[cols.status] = STATUS_TEXT[stateId];
    if (cols.date >= 0) {
      if (stateId === "completed" && !r[cols.date]) r[cols.date] = todayIso();
      if (stateId === "not-started") r[cols.date] = "";
    }
    item.date = cols.date >= 0 ? r[cols.date] : item.date;
    // With no Status column, the filled completion date IS the status.
    item.status = cols.status >= 0 ? r[cols.status] : item.date ? "Completed" : "";
    persist(stages, fileName);
    setTick((t) => t + 1);
  };

  const cycleStatus = (item) => {
    const { cols } = stage.analysis;
    const cur = statusState(item.status);
    // Date-only sheets toggle between done / to-do (no place to store "in progress").
    const next =
      cols.status < 0
        ? cur === "completed" ? "not-started" : "completed"
        : nextStatusState(cur);
    setItemStatus(item, next);
  };

  const writeNotes = (item, value) => {
    const { cols } = stage.analysis;
    if (cols.notes >= 0) stage.rows[item.rowIndex][cols.notes] = value;
    item.notes = value;
    persist(stages, fileName);
  };

  const togglePhase = (name) =>
    setCollapsedPhases((cur) => {
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
      if (!originalRef.current) {
        const b64 = (await getStored([GL_ORIG_KEY]))[GL_ORIG_KEY];
        if (b64) { try { originalRef.current = base64ToBytes(b64); } catch { /* ignore */ } }
      }
      if (originalRef.current) {
        try {
          const blob = await exportPreservingFormat(originalRef.current, stages);
          downloadBlob(blob, `${base}-updated.xlsx`);
          return;
        } catch (e) {
          console.warn("[go-live] format-preserving export failed, falling back", e);
        }
      } else if (/\.xlsx?$/i.test(fileName)) {
        setError("Re-import the Excel file to export with its original formatting. A plain copy was downloaded.");
      }
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
    setOwnerFilter("");
    setCategoryFilter("");
    originalRef.current = null;
    void setStored({ [GL_KEY]: null, [GL_ORIG_KEY]: null });
  };

  const anyFilter = Boolean(search.trim() || statusFilter || ownerFilter || categoryFilter);

  return (
    <div className="cia-ext-settings-overlay" role="dialog" aria-label="Go-Live checklist">
      <div className="cia-ext-settings-header">
        <strong>🚀 Go-Live Checklist</strong>
      </div>

      <div
        className={`cia-ext-settings-body cia-ext-chk cia-ext-gl${dragActive ? " is-drag" : ""}`}
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
            <div className="cia-ext-chk-empty-icon">🚀</div>
            <p>Import a Go-Live run sheet (P&amp;R Stage 1A / 1B or DxP) to track cutover progress step by step.</p>
            <button type="button" className="cia-ext-primary-btn" onClick={() => fileRef.current?.click()}>
              Import run sheet
            </button>
            <small>Excel or CSV — …or drag &amp; drop a file anywhere here.</small>
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
              <span>{overall.completed}/{overall.total} done · {overall.inProgress} in progress · {overall.pct}%</span>
              <div className="cia-ext-chk-bar"><div className="cia-ext-chk-bar-fill" style={{ width: `${overall.pct}%` }} /></div>
            </div>

            {/* Stage tabs (multi-sheet workbooks) */}
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

            {/* Up next */}
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
                <div className="cia-ext-chk-upnext-crumb">
                  {[upNext.phase, upNext.category].filter((x) => x && x !== "—").join(" › ")}
                </div>
                <div className="cia-ext-chk-upnext-task">
                  {upNext.taskNo ? <b>{upNext.taskNo}. </b> : null}{upNext.task}
                </div>
                {(upNext[ownerKey] || upNext.duration || upNext.dependency) ? (
                  <div className="cia-ext-chk-upnext-meta">
                    {upNext[ownerKey] ? <span title="Owner / resource">👤 {upNext[ownerKey]}</span> : null}
                    {upNext.duration ? <span title="Duration">⏱ {upNext.duration}</span> : null}
                    {upNext.dependency ? <span title="Depends on">🔗 {upNext.dependency}</span> : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Filters */}
            <div className="cia-ext-chk-filters cia-ext-gl-filters">
              <input
                className="cia-ext-chk-search"
                placeholder="Search tasks…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select className="cia-ext-chk-statusfilter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All status</option>
                <option value="not-started">To do</option>
                <option value="in-progress">In progress</option>
                <option value="completed">Done</option>
              </select>
              {ownerOptions.length > 0 ? (
                <select className="cia-ext-chk-statusfilter" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
                  <option value="">All owners</option>
                  {ownerOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : null}
              {categoryOptions.length > 0 ? (
                <select className="cia-ext-chk-statusfilter" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                  <option value="">All categories</option>
                  {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : null}
              {anyFilter ? (
                <button
                  type="button"
                  className="cia-ext-chk-filter-clear"
                  onClick={() => { setSearch(""); setStatusFilter(""); setOwnerFilter(""); setCategoryFilter(""); }}
                >
                  Clear
                </button>
              ) : null}
            </div>

            {/* Phases */}
            {phases.length === 0 ? (
              <p className="cia-ext-forum-muted">No tasks match your filters.</p>
            ) : (
              phases.map((ph) => {
                const pp = progressOf(ph.items);
                const isCollapsed = !anyFilter && collapsedPhases.has(ph.name);
                return (
                  <section key={ph.name} className="cia-ext-chk-group">
                    <button className="cia-ext-chk-group-head" onClick={() => togglePhase(ph.name)}>
                      <span className="cia-ext-chk-group-caret">{isCollapsed ? "▸" : "▾"}</span>
                      <strong>{ph.name}</strong>
                      <span className="cia-ext-chk-group-count">{pp.completed}/{pp.total}</span>
                      <span className="cia-ext-chk-group-bar"><span style={{ width: `${pp.pct}%` }} /></span>
                    </button>

                    {!isCollapsed ? (
                      <ul className="cia-ext-chk-tasks">
                        {ph.items.map((item) => {
                          const state = statusState(item.status);
                          const meta = STATUS_META[state];
                          const open = expanded === item.rowIndex;
                          const hasDetail = item[ownerKey] || item.date || item.duration || item.dependency || item.notes || item.category;
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
                                  {item.taskNo ? <b className="cia-ext-gl-no">{item.taskNo}.</b> : null} {item.task}
                                  {item.category ? <span className="cia-ext-gl-cat">{item.category}</span> : null}
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
                                  {item[ownerKey] ? <div><b>{ownerKey === "resource" ? "Resource" : ownerKey === "assignee" ? "Assignee" : "Owner"}:</b> {item[ownerKey]}</div> : null}
                                  {item.owner && ownerKey !== "owner" ? <div><b>Owner:</b> {item.owner}</div> : null}
                                  {item.duration ? <div><b>Duration:</b> {item.duration}</div> : null}
                                  {item.time ? <div><b>Time:</b> {item.time}</div> : null}
                                  {item.dependency ? <div><b>Depends on:</b> {item.dependency}</div> : null}
                                  {item.date ? <div><b>Completed:</b> {item.date}</div> : null}
                                  <label className="cia-ext-chk-notes-label">
                                    Notes
                                    <textarea
                                      className="cia-ext-chk-notes"
                                      defaultValue={item.notes}
                                      placeholder="Add a note…"
                                      onBlur={(e) => writeNotes(item, e.target.value)}
                                    />
                                  </label>
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
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

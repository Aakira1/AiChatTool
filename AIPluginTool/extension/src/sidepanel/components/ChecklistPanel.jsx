import { useEffect, useMemo, useRef, useState } from "react";
import {
  parseCsv,
  toCsv,
  analyzeChecklist,
  groupItems,
  progressOf,
  statusState,
  STATUS_TEXT,
  todayIso,
} from "../../lib/checklist.js";
import { getCompanion, saveCompanion } from "../../lib/api.js";

const STORAGE_KEY = "cia.ext.checklist.v1";

export function ChecklistPanel({ onClose }) {
  const fileRef = useRef(null);
  const [rows, setRows] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [fileName, setFileName] = useState("");
  const [tick, setTick] = useState(0);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    let active = true;
    const apply = (parsed, name) => {
      const a = analyzeChecklist(parsed);
      if (a && active) {
        setRows(parsed);
        setAnalysis(a);
        setFileName(name || "checklist.csv");
      }
    };
    (async () => {
      try {
        const remote = await getCompanion();
        if (remote?.rows?.length) {
          apply(remote.rows, remote.fileName);
          return;
        }
      } catch {
        /* fall back to local */
      }
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (saved?.rows?.length) apply(saved.rows, saved.fileName);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const persist = (nextRows, name) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows: nextRows, fileName: name }));
    } catch {
      /* ignore */
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveCompanion({ fileName: name, rows: nextRows }).catch(() => {});
    }, 700);
  };

  const loadFile = async (file) => {
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      const a = analyzeChecklist(parsed);
      if (!a) {
        setError("Couldn't find a Functional Group / Task / Status layout in that CSV.");
        return;
      }
      setRows(parsed);
      setAnalysis(a);
      setFileName(file.name);
      setError("");
      persist(parsed, file.name);
    } catch (e) {
      setError(e.message || "Failed to read the CSV");
    }
  };

  const setItemStatus = (item, stateId) => {
    if (!rows || !analysis) return;
    const { cols } = analysis;
    const r = rows[item.rowIndex];
    if (cols.status >= 0) r[cols.status] = STATUS_TEXT[stateId];
    if (cols.date >= 0) {
      if (stateId === "completed" && !r[cols.date]) r[cols.date] = todayIso();
      if (stateId === "not-started") r[cols.date] = "";
    }
    item.status = cols.status >= 0 ? r[cols.status] : item.status;
    persist(rows, fileName);
    setTick((t) => t + 1);
  };

  const groups = useMemo(() => (analysis ? groupItems(analysis.items) : []), [analysis, tick]);
  const overall = useMemo(() => (analysis ? progressOf(analysis.items) : null), [analysis, tick]);

  const downloadCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName.replace(/\.csv$/i, "") + "-updated.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const clearSession = () => {
    setRows(null);
    setAnalysis(null);
    setFileName("");
    localStorage.removeItem(STORAGE_KEY);
    saveCompanion({ fileName: "", rows: null }).catch(() => {});
  };

  return (
    <div className="cia-ext-settings-overlay" role="dialog" aria-label="Companion">
      <div className="cia-ext-settings-header">
        <strong>Companion</strong>
        <button type="button" className="cia-ext-icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div
        className={`cia-ext-settings-body cia-ext-chk${dragActive ? " is-drag" : ""}`}
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
        {error ? <p className="cia-ext-banner cia-ext-banner-error">{error}</p> : null}

        <div className="cia-ext-chk-actions">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadFile(f);
              e.target.value = "";
            }}
          />
          <button type="button" className="cia-ext-secondary-btn" onClick={() => fileRef.current?.click()}>
            {rows ? "Import another" : "Import CSV"}
          </button>
          {rows ? (
            <>
              <button type="button" className="cia-ext-secondary-btn" onClick={downloadCsv}>
                Download CSV
              </button>
              <button type="button" className="cia-ext-link-danger" onClick={clearSession}>
                Clear
              </button>
            </>
          ) : null}
        </div>

        {!rows ? (
          <p className="cia-ext-forum-muted">
            Drag &amp; drop or import a companion checklist CSV to track progress.
          </p>
        ) : (
          <>
            <div className="cia-ext-chk-summary">
              <span>
                {overall.completed}/{overall.total} complete · {overall.inProgress} in progress
              </span>
              <div className="cia-ext-chk-bar">
                <div className="cia-ext-chk-bar-fill" style={{ width: `${overall.pct}%` }} />
              </div>
            </div>

            {groups.map((fg) => {
              const fp = progressOf(fg.items);
              return (
                <section key={fg.name} className="cia-ext-chk-group">
                  <div className="cia-ext-chk-group-head">
                    <strong>{fg.name}</strong>
                    <span>
                      {fp.completed}/{fp.total}
                    </span>
                  </div>
                  <ul className="cia-ext-chk-tasks">
                    {fg.items.map((item) => {
                      const state = statusState(item.status);
                      return (
                        <li key={item.rowIndex} className={`cia-ext-chk-task is-${state}`}>
                          <input
                            type="checkbox"
                            checked={state === "completed"}
                            onChange={(e) =>
                              setItemStatus(item, e.target.checked ? "completed" : "not-started")
                            }
                          />
                          <span
                            className="cia-ext-chk-task-title"
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              setItemStatus(item, state === "completed" ? "not-started" : "completed")
                            }
                          >
                            {item.task}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

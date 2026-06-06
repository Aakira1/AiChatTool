import { useMemo, useRef, useState, useEffect } from "react";
import { parseCsv, toCsv } from "../lib/csv.js";
import {
  analyzeChecklist,
  groupItems,
  progressOf,
  statusState,
  STATUS_TEXT,
  todayIso,
} from "../lib/checklist.js";
import { downloadXlsxSpec } from "../lib/api.js";
import { useToast } from "../components/ui/ToastProvider.jsx";

const STORAGE_KEY = "cia.checklist.session.v1";

const STATUS_OPTIONS = [
  { id: "not-started", label: "Not started" },
  { id: "in-progress", label: "In progress" },
  { id: "completed", label: "Completed" },
];

function ProgressBar({ pct }) {
  return (
    <div className="cia-chk-bar" title={`${pct}% complete`}>
      <div className="cia-chk-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ChecklistPage() {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [tick, setTick] = useState(0); // force re-render after mutating rows in place
  const [dragActive, setDragActive] = useState(false);

  // Resume the last session from localStorage.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.rows?.length) {
        const a = analyzeChecklist(saved.rows);
        if (a) {
          setRows(saved.rows);
          setAnalysis(a);
          setFileName(saved.fileName || "checklist.csv");
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (nextRows, name) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows: nextRows, fileName: name }));
    } catch {
      /* ignore quota */
    }
  };

  const loadFile = async (file) => {
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      const a = analyzeChecklist(parsed);
      if (!a) {
        toast.error("Couldn't find a Functional Group / Task / Status layout in that CSV.");
        return;
      }
      setRows(parsed);
      setAnalysis(a);
      setFileName(file.name);
      persist(parsed, file.name);
      toast.success(`Loaded ${a.items.length} tasks`);
    } catch (error) {
      toast.error(error.message || "Failed to read the CSV");
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
    // Keep the analysis items in sync (they reference the same row data).
    item.status = cols.status >= 0 ? r[cols.status] : item.status;
    item.date = cols.date >= 0 ? r[cols.date] : item.date;
    persist(rows, fileName);
    setTick((t) => t + 1);
  };

  const groups = useMemo(
    () => (analysis ? groupItems(analysis.items) : []),
    [analysis, tick],
  );
  const overall = useMemo(
    () => (analysis ? progressOf(analysis.items) : null),
    [analysis, tick],
  );
  const insights = useMemo(() => {
    if (!analysis) return null;
    const nextUp = analysis.items.filter((i) => statusState(i.status) === "not-started").slice(0, 6);
    const inProgress = analysis.items
      .filter((i) => statusState(i.status) === "in-progress")
      .slice(0, 6);
    return { nextUp, inProgress };
  }, [analysis, tick]);

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };

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

  const downloadExcel = async () => {
    try {
      const sheet = {
        name: "Checklist",
        columns: ["Functional Group", "Task Group", "Task", "Status", "Date", "Responsible"],
        rows: analysis.items.map((i) => [
          i.functionalGroup,
          i.taskGroup,
          i.task,
          i.status,
          i.date,
          i.responsible,
        ]),
      };
      await downloadXlsxSpec({ title: fileName.replace(/\.csv$/i, "") || "Checklist", sheets: [sheet] });
    } catch (error) {
      toast.error(error.message || "Couldn't build the Excel file");
    }
  };

  const clearSession = () => {
    setRows(null);
    setAnalysis(null);
    setFileName("");
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <div
      className={`cia-chk-page t1-animate-in${dragActive ? " is-drag" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragActive(false);
      }}
      onDrop={handleDrop}
    >
      {dragActive ? <div className="cia-chk-dropmask">Drop the CSV to import</div> : null}
      <div className="cia-chk-header">
        <div>
          <h1>Companion</h1>
          <p>Import an implementation companion CSV, track progress, and export it back.</p>
        </div>
        <div className="cia-chk-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="cia-file-input-hidden"
            onChange={(event) => {
              const f = event.target.files?.[0];
              if (f) void loadFile(f);
              event.target.value = "";
            }}
          />
          <button type="button" className="cia-header-btn" onClick={() => fileInputRef.current?.click()}>
            {rows ? "Import another" : "Import CSV"}
          </button>
          {rows ? (
            <>
              <button type="button" className="cia-header-btn" onClick={downloadCsv}>
                Download CSV
              </button>
              <button type="button" className="cia-header-btn" onClick={() => void downloadExcel()}>
                Download Excel
              </button>
              <button type="button" className="cia-header-btn" onClick={clearSession}>
                Clear
              </button>
            </>
          ) : null}
        </div>
      </div>

      {!rows ? (
        <div className="cia-chk-empty">
          <p>
            <strong>Drag &amp; drop</strong> a companion checklist CSV here (or use Import CSV) — e.g.
            the P&amp;R Transitions Implementation Companion. It detects the{" "}
            <strong>Functional Group · Task Group · Task · Status</strong> layout, lets you tick tasks
            off (auto-stamping the completion date), and exports the updated file.
          </p>
        </div>
      ) : (
        <>
          <div className="cia-chk-summary">
            <div className="cia-chk-summary-head">
              <strong>{fileName}</strong>
              <span>
                {overall.completed}/{overall.total} complete · {overall.inProgress} in progress
              </span>
            </div>
            <ProgressBar pct={overall.pct} />
          </div>

          {insights && (insights.nextUp.length || insights.inProgress.length) ? (
            <div className="cia-chk-insights">
              <div className="cia-chk-insight-card">
                <h3>▶ Up next</h3>
                {insights.nextUp.length ? (
                  <ul>
                    {insights.nextUp.map((i) => (
                      <li key={i.rowIndex}>
                        <span className="cia-chk-insight-fg">{i.functionalGroup}</span>
                        {i.task}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cia-chk-insight-empty">Nothing left to start 🎉</p>
                )}
              </div>
              <div className="cia-chk-insight-card">
                <h3>⏳ In progress</h3>
                {insights.inProgress.length ? (
                  <ul>
                    {insights.inProgress.map((i) => (
                      <li key={i.rowIndex}>
                        <span className="cia-chk-insight-fg">{i.functionalGroup}</span>
                        {i.task}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cia-chk-insight-empty">No tasks in progress.</p>
                )}
              </div>
            </div>
          ) : null}

          {groups.map((fg) => {
            const fgProgress = progressOf(fg.taskGroups.flatMap((tg) => tg.items));
            return (
              <section key={fg.name} className="cia-chk-group">
                <div className="cia-chk-group-head">
                  <h2>{fg.name}</h2>
                  <span className="cia-chk-group-meta">
                    {fgProgress.completed}/{fgProgress.total}
                  </span>
                  <div className="cia-chk-group-bar">
                    <ProgressBar pct={fgProgress.pct} />
                  </div>
                </div>

                {fg.taskGroups.map((tg) => (
                  <div key={tg.name} className="cia-chk-taskgroup">
                    {tg.name !== "—" ? <h3>{tg.name}</h3> : null}
                    <ul className="cia-chk-tasks">
                      {tg.items.map((item) => {
                        const state = statusState(item.status);
                        return (
                          <li key={item.rowIndex} className={`cia-chk-task is-${state}`}>
                            <input
                              type="checkbox"
                              checked={state === "completed"}
                              onChange={(event) =>
                                setItemStatus(item, event.target.checked ? "completed" : "not-started")
                              }
                              aria-label={`Mark ${item.task} complete`}
                            />
                            <div className="cia-chk-task-main">
                              <span className="cia-chk-task-title">{item.task}</span>
                              <span className="cia-chk-task-meta">
                                {item.responsible ? <span>👤 {item.responsible}</span> : null}
                                {item.date ? <span>📅 {item.date}</span> : null}
                              </span>
                            </div>
                            <select
                              className="cia-chk-status"
                              value={state}
                              onChange={(event) => setItemStatus(item, event.target.value)}
                            >
                              {STATUS_OPTIONS.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

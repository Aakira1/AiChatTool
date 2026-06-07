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
import {
  downloadXlsxSpec,
  downloadCompanionXlsx,
  fileToBase64Async,
  getCompanion,
  saveCompanion,
  parseXlsxWorkbook,
} from "../lib/api.js";
import { classifyRows, DOC_TYPE_LABEL, DOC_TYPE_APP } from "../lib/docType.js";
import { useToast } from "../components/ui/ToastProvider.jsx";

const STORAGE_KEY = "cia.checklist.session.v2";

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

// Build stage objects from a set of {name, rows} sheets: keep only the sheets
// that actually contain a Functional Group / Task / Status checklist layout.
function buildStages(sheets) {
  const stages = [];
  for (const sheet of sheets) {
    const analysis = analyzeChecklist(sheet.rows);
    if (analysis) stages.push({ name: sheet.name, rows: sheet.rows, analysis });
  }
  return stages;
}

export function ChecklistPage() {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [stages, setStages] = useState(null); // [{ name, rows, analysis }]
  const [activeStage, setActiveStage] = useState(0);
  const [fileName, setFileName] = useState("");
  const [tick, setTick] = useState(0); // force re-render after mutating rows in place
  const [dragActive, setDragActive] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef(null);

  const saveTimer = useRef(null);
  const serverUpdatedAt = useRef(null);
  const originalXlsx = useRef(null); // base64 of the imported .xlsx (for 1:1 export)

  // Adopt a parsed workbook (already split into stages).
  const applyStages = (nextStages, name) => {
    if (!nextStages?.length) return false;
    setStages(nextStages);
    setActiveStage((i) => Math.min(i, nextStages.length - 1));
    setFileName(name || "checklist.csv");
    setTick((t) => t + 1);
    return true;
  };

  // Turn a server/local payload ({ sheets } or { rows }) into stages.
  const stagesFromPayload = (payload) => {
    if (payload?.sheets?.length) return buildStages(payload.sheets);
    if (payload?.rows?.length) return buildStages([{ name: "Checklist", rows: payload.rows }]);
    return [];
  };

  // Pull the latest server copy; adopt it if it changed elsewhere.
  const refreshFromServer = async ({ notify = false } = {}) => {
    try {
      const remote = await getCompanion();
      if (
        (remote?.sheets?.length || remote?.rows?.length) &&
        remote.updatedAt !== serverUpdatedAt.current
      ) {
        serverUpdatedAt.current = remote.updatedAt;
        applyStages(stagesFromPayload(remote), remote.fileName);
        if (notify) toast.info("Companion refreshed from the latest saved copy.");
      }
    } catch {
      /* offline — keep local */
    }
  };

  // Load the shared (server) checklist first, falling back to the local cache.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const remote = await getCompanion();
        if ((remote?.sheets?.length || remote?.rows?.length) && active) {
          serverUpdatedAt.current = remote.updatedAt;
          applyStages(stagesFromPayload(remote), remote.fileName);
          return;
        }
      } catch {
        /* fall back to local cache */
      }
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (saved?.dataBase64) originalXlsx.current = saved.dataBase64;
        const local = stagesFromPayload(saved);
        if (local.length && active) applyStages(local, saved.fileName);
      } catch {
        /* ignore */
      }
    })();
    const onFocus = () => void refreshFromServer();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the export menu when clicking outside it.
  useEffect(() => {
    if (!exportOpen) return undefined;
    const onDown = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [exportOpen]);

  const persist = (nextStages, name) => {
    const sheets = nextStages.map((s) => ({ name: s.name, rows: s.rows }));
    try {
      // Keep the original .xlsx bytes too so a 1:1 export still works after reload.
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ sheets, fileName: name, dataBase64: originalXlsx.current ?? null }),
      );
    } catch {
      /* ignore quota */
    }
    // Debounced server sync so the same checklist appears in the extension.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveCompanion({
        fileName: name,
        rows: sheets[0]?.rows ?? null,
        sheets,
        baseUpdatedAt: serverUpdatedAt.current,
      })
        .then((res) => {
          if (res?.conflict) {
            serverUpdatedAt.current = res.updatedAt;
            applyStages(stagesFromPayload(res), res.fileName);
            toast.info("Companion was updated elsewhere — loaded the latest.");
          } else if (res?.updatedAt) {
            serverUpdatedAt.current = res.updatedAt;
          }
        })
        .catch(() => {});
    }, 700);
  };

  const loadFile = async (file) => {
    try {
      const isExcel = /\.xlsx?$/i.test(file.name);
      let nextStages;
      if (isExcel) {
        const { sheets, dataBase64 } = await parseXlsxWorkbook(file);
        originalXlsx.current = dataBase64;
        nextStages = buildStages(sheets);
        if (!nextStages.length) {
          // No stage sheet matched — classify the first sheet for a helpful hint.
          const type = classifyRows(sheets[0]?.rows ?? []);
          const where = DOC_TYPE_APP[type];
          toast.error(
            where && type !== "companion"
              ? `This looks like a ${DOC_TYPE_LABEL[type]} — open it in ${where}.`
              : "Couldn't find a Functional Group / Task / Status layout in any sheet.",
          );
          return;
        }
      } else {
        originalXlsx.current = null;
        const rows = parseCsv(await file.text());
        nextStages = buildStages([{ name: "Checklist", rows }]);
        if (!nextStages.length) {
          const type = classifyRows(rows);
          const where = DOC_TYPE_APP[type];
          toast.error(
            where && type !== "companion"
              ? `This looks like a ${DOC_TYPE_LABEL[type]} — open it in ${where}.`
              : "Couldn't find a Functional Group / Task / Status layout in that file.",
          );
          return;
        }
      }
      setActiveStage(0);
      applyStages(nextStages, file.name);
      persist(nextStages, file.name);
      const total = nextStages.reduce((n, s) => n + s.analysis.items.length, 0);
      toast.success(
        nextStages.length > 1
          ? `Imported Companion — ${nextStages.length} stages, ${total} tasks`
          : `Imported Companion checklist — ${total} tasks`,
      );
    } catch (error) {
      toast.error(error.message || "Failed to read the file");
    }
  };

  const setItemStatus = (stage, item, stateId) => {
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

  const stage = stages?.[activeStage] ?? null;
  const allItems = useMemo(
    () => (stages ? stages.flatMap((s) => s.analysis.items) : []),
    [stages, tick],
  );
  const groups = useMemo(() => (stage ? groupItems(stage.analysis.items) : []), [stage, tick]);
  const overall = useMemo(() => (stages ? progressOf(allItems) : null), [stages, allItems, tick]);
  const stageProgress = useMemo(
    () => (stages ? stages.map((s) => progressOf(s.analysis.items)) : []),
    [stages, tick],
  );
  const insights = useMemo(() => {
    if (!stages) return null;
    const nextUp = allItems.filter((i) => statusState(i.status) === "not-started").slice(0, 6);
    const inProgress = allItems.filter((i) => statusState(i.status) === "in-progress").slice(0, 6);
    return { nextUp, inProgress };
  }, [stages, allItems, tick]);

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };

  const downloadCsv = () => {
    // CSV is single-grid: export the active stage's grid.
    const blob = new Blob([toCsv(stage.rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const base = fileName.replace(/\.(csv|xlsx?)$/i, "");
    link.href = url;
    link.download = `${base}${stages.length > 1 ? `-${stage.name}` : ""}-updated.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = async () => {
    try {
      const title = fileName.replace(/\.(csv|xlsx?)$/i, "") || "Checklist";
      if (originalXlsx.current) {
        // 1:1 export — re-emit the original workbook (every stage sheet),
        // preserving styling, column widths, merges and formulas.
        await downloadCompanionXlsx({
          dataBase64: originalXlsx.current,
          sheets: stages.map((s) => ({ name: s.name, rows: s.rows })),
          title,
        });
      } else {
        // Imported from CSV — build a plain workbook from the active grid.
        await downloadXlsxSpec({ title, sheets: [{ name: "Companion", columns: [], rows: stage.rows }] });
      }
    } catch (error) {
      toast.error(error.message || "Couldn't build the Excel file");
    }
  };

  const clearSession = () => {
    setStages(null);
    setActiveStage(0);
    setFileName("");
    originalXlsx.current = null;
    localStorage.removeItem(STORAGE_KEY);
    saveCompanion({ fileName: "", rows: null, sheets: null }).catch(() => {});
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
          <p>Import an implementation/configuration companion, track progress, and export it back.</p>
        </div>
        <div className="cia-chk-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="cia-file-input-hidden"
            onChange={(event) => {
              const f = event.target.files?.[0];
              if (f) void loadFile(f);
              event.target.value = "";
            }}
          />
          <button type="button" className="cia-header-btn" onClick={() => fileInputRef.current?.click()}>
            {stages ? "Import another" : "Import"}
          </button>
          {stages ? (
            <>
              <button
                type="button"
                className="cia-header-btn"
                onClick={() => void refreshFromServer({ notify: true })}
                title="Reload the latest saved copy"
              >
                Refresh
              </button>
              <div className="cia-export-menu" ref={exportRef}>
                <button
                  type="button"
                  className="cia-header-btn"
                  aria-haspopup="menu"
                  aria-expanded={exportOpen}
                  onClick={() => setExportOpen((v) => !v)}
                >
                  Export ▾
                </button>
                {exportOpen ? (
                  <div className="cia-export-pop" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setExportOpen(false);
                        void downloadExcel();
                      }}
                    >
                      <span className="cia-export-ext">XLSX</span>
                      <span className="cia-export-label">
                        Excel — original template, only updated fields
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setExportOpen(false);
                        downloadCsv();
                      }}
                    >
                      <span className="cia-export-ext">CSV</span>
                      <span className="cia-export-label">
                        CSV — {stages.length > 1 ? `current stage (${stage.name})` : "flat grid"}
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
              <button type="button" className="cia-header-btn" onClick={clearSession}>
                Clear
              </button>
            </>
          ) : null}
        </div>
      </div>

      {!stages ? (
        <div className="cia-chk-empty">
          <p>
            <strong>Drag &amp; drop</strong> a companion here (CSV or multi-sheet Excel) — e.g. the
            P&amp;R Transitions Configuration Companion. It detects the{" "}
            <strong>Functional Group · Task Group · Task · Status</strong> layout across every stage
            sheet, lets you tick tasks off (auto-stamping the completion date), and exports the updated
            workbook in its original format.
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

          {stages.length > 1 ? (
            <div className="cia-chk-stages" role="tablist">
              {stages.map((s, i) => {
                const p = stageProgress[i];
                return (
                  <button
                    key={s.name}
                    type="button"
                    role="tab"
                    aria-selected={i === activeStage}
                    className={`cia-chk-stage-tab${i === activeStage ? " is-active" : ""}`}
                    onClick={() => setActiveStage(i)}
                  >
                    <span className="cia-chk-stage-name">{s.name}</span>
                    <span className="cia-chk-stage-meta">
                      {p.completed}/{p.total} · {p.pct}%
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {insights && (insights.nextUp.length || insights.inProgress.length) ? (
            <div className="cia-chk-insights">
              <div className="cia-chk-insight-card cia-chk-insight-next">
                <h3>
                  <span className="cia-chk-insight-dot" aria-hidden="true">
                    ▶
                  </span>
                  Up next
                  <span className="cia-chk-insight-count">
                    {overall.total - overall.completed - overall.inProgress}
                  </span>
                </h3>
                {insights.nextUp.length ? (
                  <ol className="cia-chk-insight-list">
                    {insights.nextUp.map((i) => (
                      <li key={`${i.functionalGroup}-${i.rowIndex}-${i.task}`}>
                        <span className="cia-chk-insight-fg">{i.functionalGroup}</span>
                        <span className="cia-chk-insight-task">{i.task}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="cia-chk-insight-empty">Nothing left to start 🎉</p>
                )}
              </div>
              <div className="cia-chk-insight-card cia-chk-insight-prog">
                <h3>
                  <span className="cia-chk-insight-dot" aria-hidden="true">
                    ⏳
                  </span>
                  In progress
                  <span className="cia-chk-insight-count">{overall.inProgress}</span>
                </h3>
                {insights.inProgress.length ? (
                  <ul className="cia-chk-insight-list">
                    {insights.inProgress.map((i) => (
                      <li key={`${i.functionalGroup}-${i.rowIndex}-${i.task}`}>
                        <span className="cia-chk-insight-fg">{i.functionalGroup}</span>
                        <span className="cia-chk-insight-task">{i.task}</span>
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
                                setItemStatus(stage, item, event.target.checked ? "completed" : "not-started")
                              }
                              aria-label={`Mark ${item.task} complete`}
                            />
                            <div
                              className="cia-chk-task-main"
                              role="button"
                              tabIndex={0}
                              onClick={() =>
                                setItemStatus(stage, item, state === "completed" ? "not-started" : "completed")
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setItemStatus(
                                    stage,
                                    item,
                                    state === "completed" ? "not-started" : "completed",
                                  );
                                }
                              }}
                            >
                              <span className="cia-chk-task-title">{item.task}</span>
                              <span className="cia-chk-task-meta">
                                {item.responsible ? <span>👤 {item.responsible}</span> : null}
                                {item.date ? <span>📅 {item.date}</span> : null}
                              </span>
                            </div>
                            <select
                              className="cia-chk-status"
                              value={state}
                              onChange={(event) => setItemStatus(stage, item, event.target.value)}
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

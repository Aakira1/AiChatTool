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
import { getCompanion, saveCompanion, parseXlsxWorkbook } from "../../lib/api.js";

const STORAGE_KEY = "cia.ext.checklist.v2";

// Build stages from {name, rows} sheets — keep only checklist-shaped sheets.
function buildStages(sheets) {
  const stages = [];
  for (const sheet of sheets) {
    const analysis = analyzeChecklist(sheet.rows);
    if (analysis) stages.push({ name: sheet.name, rows: sheet.rows, analysis });
  }
  return stages;
}

function stagesFromPayload(payload) {
  if (payload?.sheets?.length) return buildStages(payload.sheets);
  if (payload?.rows?.length) return buildStages([{ name: "Checklist", rows: payload.rows }]);
  return [];
}

export function ChecklistPanel({ onClose }) {
  const fileRef = useRef(null);
  const [stages, setStages] = useState(null);
  const [activeStage, setActiveStage] = useState(0);
  const [fileName, setFileName] = useState("");
  const [tick, setTick] = useState(0);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const saveTimer = useRef(null);
  const serverUpdatedAt = useRef(null);

  const apply = (nextStages, name) => {
    if (!nextStages?.length) return false;
    setStages(nextStages);
    setActiveStage((i) => Math.min(i, nextStages.length - 1));
    setFileName(name || "checklist.csv");
    setTick((t) => t + 1);
    return true;
  };

  const refreshFromServer = async () => {
    try {
      const remote = await getCompanion();
      if (
        (remote?.sheets?.length || remote?.rows?.length) &&
        remote.updatedAt !== serverUpdatedAt.current
      ) {
        serverUpdatedAt.current = remote.updatedAt;
        apply(stagesFromPayload(remote), remote.fileName);
      }
    } catch {
      /* offline */
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const remote = await getCompanion();
        if ((remote?.sheets?.length || remote?.rows?.length) && active) {
          serverUpdatedAt.current = remote.updatedAt;
          apply(stagesFromPayload(remote), remote.fileName);
          return;
        }
      } catch {
        /* fall back to local */
      }
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        const local = stagesFromPayload(saved);
        if (local.length && active) apply(local, saved.fileName);
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
  }, []);

  const persist = (nextStages, name) => {
    const sheets = nextStages.map((s) => ({ name: s.name, rows: s.rows }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ sheets, fileName: name }));
    } catch {
      /* ignore */
    }
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
            apply(stagesFromPayload(res), res.fileName);
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
        const { sheets } = await parseXlsxWorkbook(file);
        nextStages = buildStages(sheets);
      } else {
        nextStages = buildStages([{ name: "Checklist", rows: parseCsv(await file.text()) }]);
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
    persist(stages, fileName);
    setTick((t) => t + 1);
  };

  const groups = useMemo(() => (stage ? groupItems(stage.analysis.items) : []), [stage, tick]);
  const overall = useMemo(
    () => (stages ? progressOf(stages.flatMap((s) => s.analysis.items)) : null),
    [stages, tick],
  );

  const downloadCsv = () => {
    const blob = new Blob([toCsv(stage.rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const base = fileName.replace(/\.(csv|xlsx?)$/i, "");
    link.download = `${base}${stages.length > 1 ? `-${stage.name}` : ""}-updated.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const clearSession = () => {
    setStages(null);
    setActiveStage(0);
    setFileName("");
    localStorage.removeItem(STORAGE_KEY);
    saveCompanion({ fileName: "", rows: null, sheets: null }).catch(() => {});
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
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadFile(f);
              e.target.value = "";
            }}
          />
          <button type="button" className="cia-ext-secondary-btn" onClick={() => fileRef.current?.click()}>
            {stages ? "Import another" : "Import"}
          </button>
          {stages ? (
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

        {!stages ? (
          <p className="cia-ext-forum-muted">
            Drag &amp; drop or import a companion checklist (CSV or multi-sheet Excel) to track progress.
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

            {stages.length > 1 ? (
              <div className="cia-ext-chk-stages">
                {stages.map((s, i) => {
                  const p = progressOf(s.analysis.items);
                  return (
                    <button
                      key={s.name}
                      type="button"
                      className={`cia-ext-chk-stage-tab${i === activeStage ? " is-active" : ""}`}
                      onClick={() => setActiveStage(i)}
                    >
                      {s.name} · {p.pct}%
                    </button>
                  );
                })}
              </div>
            ) : null}

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

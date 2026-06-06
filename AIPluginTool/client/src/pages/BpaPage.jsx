import { useMemo, useRef, useState } from "react";
import { parseCsv, toCsv } from "../lib/csv.js";
import {
  analyzeBpa,
  bpaTaskNames,
  bpaDecisionLabels,
  addItem as addItemToGrid,
  generateProcess,
  parseBpaGraph,
} from "../lib/bpa.js";
import { bpaAssist } from "../lib/api.js";
import { BpaGraph } from "../components/BpaGraph.jsx";
import { useToast } from "../components/ui/ToastProvider.jsx";

function withCell(row, i, value) {
  const copy = [...row];
  copy[i] = value;
  return copy;
}

export function BpaPage() {
  const toast = useToast();
  const fileRef = useRef(null);
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [newItem, setNewItem] = useState({}); // taskRowIndex -> draft label
  const [tab, setTab] = useState("editor"); // editor | diagram

  const analysis = useMemo(() => (rows ? analyzeBpa(rows) : null), [rows]);
  const graph = useMemo(
    () => (rows && analysis ? parseBpaGraph(rows, analysis) : null),
    [rows, analysis],
  );

  const loadFile = async (file) => {
    try {
      const parsed = parseCsv(await file.text());
      const a = analyzeBpa(parsed);
      if (!a) {
        toast.error("That doesn't look like a BPA (BPM_BPDEFINITION) CSV.");
        return;
      }
      setRows(parsed);
      setFileName(file.name);
      setSuggestions(null);
      toast.success(`Loaded ${a.tasks.length} tasks`);
    } catch (error) {
      toast.error(error.message || "Failed to read the CSV");
    }
  };

  const setCell = (rowIndex, colName, value) => {
    const i = analysis.idx[colName];
    if (i == null) return;
    setRows((prev) => prev.map((r, ri) => (ri === rowIndex ? withCell(r, i, value) : r)));
  };

  const addItem = (task) => {
    const label = (newItem[task.rowIndex] || "").trim();
    if (!label) return;
    const next = [...rows];
    addItemToGrid(next, analysis, task, label);
    setRows(next);
    setNewItem((m) => ({ ...m, [task.rowIndex]: "" }));
    toast.success(`Added "${label}" to ${task.name}`);
  };

  const runSuggest = async () => {
    if (!prompt.trim()) return;
    setSuggesting(true);
    try {
      const res = await bpaAssist({
        prompt,
        tasks: analysis ? bpaTaskNames(analysis) : [],
        decisions: analysis ? bpaDecisionLabels(analysis) : [],
      });
      setSuggestions(res);
      if (!res.tasks?.length) {
        toast.info("No structured plan came back — try rephrasing.");
      }
    } catch (error) {
      toast.error(error.message || "Couldn't get suggestions");
    } finally {
      setSuggesting(false);
    }
  };

  const generateFromPlan = () => {
    if (!suggestions?.tasks?.length) return;
    const next = generateProcess(rows, analysis, suggestions.tasks);
    setRows(next);
    toast.success(`Added ${suggestions.tasks.length} tasks to the process`);
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      /* ignore */
    }
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

  const editableTasks = analysis?.tasks.filter((t) => t.type !== "START" && t.type !== "END") ?? [];

  return (
    <div
      className={`cia-bpa-page t1-animate-in${dragActive ? " is-drag" : ""}`}
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
      {dragActive ? <div className="cia-pkg-dropmask">Drop the BPA CSV to open</div> : null}

      <div className="cia-bpa-header">
        <div>
          <h1>BPA Helper</h1>
          <p>Open a BPA process CSV, name tasks &amp; decisions with AI help, and add decision items.</p>
        </div>
        <div className="cia-bpa-actions">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="cia-file-input-hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadFile(f);
              e.target.value = "";
            }}
          />
          <button type="button" className="cia-header-btn" onClick={() => fileRef.current?.click()}>
            {rows ? "Open another" : "Open BPA CSV"}
          </button>
          {rows ? (
            <>
              <button
                type="button"
                className={`cia-header-btn${tab === "editor" ? " active" : ""}`}
                onClick={() => setTab("editor")}
              >
                Editor
              </button>
              <button
                type="button"
                className={`cia-header-btn${tab === "diagram" ? " active" : ""}`}
                onClick={() => setTab("diagram")}
              >
                Diagram
              </button>
              <button type="button" className="cia-header-btn" onClick={downloadCsv}>
                Download CSV
              </button>
            </>
          ) : null}
        </div>
      </div>

      {!rows ? (
        <div className="cia-pkg-empty">
          <p>
            <strong>Drag &amp; drop</strong> a BPA process CSV (the BPM_BPDEFINITION export). It lists
            each task and its decision branches so you can rename them and add new decision items —
            with an AI prompt to suggest names and outcomes.
          </p>
        </div>
      ) : tab === "diagram" ? (
        graph && graph.nodes.length ? (
          <BpaGraph graph={graph} />
        ) : (
          <p className="cia-forum-muted">
            No diagram in this file (the process Definition has no nodes).
          </p>
        )
      ) : (
        <>
          {/* AI prompt field */}
          <div className="cia-bpa-assist">
            <label className="cia-bpa-assist-label" htmlFor="bpa-prompt">
              Describe the process or what you need — AI suggests task/decision names &amp; items
            </label>
            <div className="cia-bpa-assist-row">
              <textarea
                id="bpa-prompt"
                rows={2}
                value={prompt}
                placeholder="e.g. A building certificate approval flow with review, approve/revise, and issue steps"
                onChange={(e) => setPrompt(e.target.value)}
              />
              <button
                type="button"
                className="cia-header-btn"
                onClick={() => void runSuggest()}
                disabled={suggesting || !prompt.trim()}
              >
                {suggesting ? "Thinking…" : "Suggest"}
              </button>
            </div>

            {suggestions?.tasks?.length ? (
              <div className="cia-bpa-suggestions">
                <div className="cia-bpa-suggest-top">
                  <h4>Proposed process ({suggestions.tasks.length} tasks)</h4>
                  <button type="button" className="cia-bpa-add" onClick={generateFromPlan}>
                    + Generate into process
                  </button>
                </div>
                {suggestions.tasks.map((t, i) => (
                  <div key={`${t.name}-${i}`} className="cia-bpa-suggest-dec">
                    <strong onClick={() => copy(t.name)} title="Click to copy">
                      {i + 1}. {t.name}
                    </strong>
                    <div className="cia-bpa-chips">
                      {t.items.map((it) => (
                        <button key={it} type="button" className="cia-bpa-chip" onClick={() => copy(it)}>
                          {it}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="cia-bpa-suggest-hint">
                  "Generate into process" clones your file's task/decision rows for each item
                  (names &amp; structure). Branch wiring is set up in TechnologyOne.
                </p>
              </div>
            ) : null}
          </div>

          {/* Tasks + decision items */}
          <div className="cia-bpa-tasks">
            {editableTasks.map((task) => (
              <section key={task.rowIndex} className="cia-bpa-task">
                <div className="cia-bpa-task-head">
                  <span className="cia-bpa-task-type">{task.type}</span>
                  <input
                    className="cia-bpa-task-name"
                    value={task.name}
                    onChange={(e) => setCell(task.rowIndex, "TaskTaskName", e.target.value)}
                  />
                </div>
                <div className="cia-bpa-items">
                  {task.items.length === 0 ? (
                    <p className="cia-forum-muted">No decision items.</p>
                  ) : (
                    task.items.map((item) => (
                      <div key={item.rowIndex} className="cia-bpa-item">
                        <input
                          className="cia-bpa-item-label"
                          value={item.decision}
                          placeholder="Decision label"
                          onChange={(e) => setCell(item.rowIndex, "ActionDecision", e.target.value)}
                        />
                        <span className="cia-bpa-item-desc" title={item.description}>
                          {item.type}
                        </span>
                      </div>
                    ))
                  )}
                  <div className="cia-bpa-additem">
                    <input
                      value={newItem[task.rowIndex] || ""}
                      placeholder="New decision item (e.g. Reject)"
                      onChange={(e) => setNewItem((m) => ({ ...m, [task.rowIndex]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addItem(task);
                      }}
                    />
                    <button type="button" className="cia-bpa-add" onClick={() => addItem(task)}>
                      + Add item
                    </button>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

import { useMemo, useRef, useState } from "react";
import { parseCsv, toCsv } from "../lib/csv.js";
import {
  analyzeBpa,
  bpaTaskNames,
  bpaDecisionLabels,
  generateProcess,
  createEmptyBpa,
  bpaToModel,
  modelToRows,
} from "../lib/bpa.js";
import { bpaAssist, parseXlsxFile } from "../lib/api.js";
import { classifyRows, DOC_TYPE_LABEL, DOC_TYPE_APP } from "../lib/docType.js";
import { BpaGraph } from "../components/BpaGraph.jsx";
import { useToast } from "../components/ui/ToastProvider.jsx";

export function BpaPage() {
  const toast = useToast();
  const fileRef = useRef(null);
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState(null);

  const analysis = useMemo(() => (rows ? analyzeBpa(rows) : null), [rows]);
  const model = useMemo(
    () => (rows && analysis ? bpaToModel(rows, analysis) : null),
    [rows, analysis],
  );

  // The editor hands back a full { nodes, connections } model → rebuild the rows.
  const onModelChange = (nextModel) => {
    if (!rows || !analysis) return;
    setRows(modelToRows(rows, analysis, nextModel));
  };

  const loadFile = async (file) => {
    try {
      const isExcel = /\.xlsx?$/i.test(file.name);
      const parsed = isExcel ? await parseXlsxFile(file) : parseCsv(await file.text());
      const type = classifyRows(parsed);
      const a = analyzeBpa(parsed);
      if (!a) {
        const where = DOC_TYPE_APP[type];
        toast.error(
          where && type !== "bpa"
            ? `This looks like a ${DOC_TYPE_LABEL[type]} — open it in ${where}.`
            : "That doesn't look like a BPA (BPM_BPDEFINITION) export.",
        );
        return;
      }
      setRows(parsed);
      setFileName(file.name);
      setSuggestions(null);
      toast.success(`Imported BPA process — ${a.tasks.length} tasks`);
    } catch (error) {
      toast.error(error.message || "Failed to read the file");
    }
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
      if (!res.tasks?.length) toast.info("No structured plan came back — try rephrasing.");
    } catch (error) {
      toast.error(error.message || "Couldn't get suggestions");
    } finally {
      setSuggesting(false);
    }
  };

  const newBpa = () => {
    setRows(createEmptyBpa());
    setFileName("New BPA");
    setSuggestions(null);
    toast.success("Started a new BPA — drag from the palette or describe it above.");
  };

  const generateFromPlan = () => {
    if (!suggestions?.tasks?.length) return;
    const base = rows ?? createEmptyBpa();
    const baseAnalysis = analyzeBpa(base);
    setRows(generateProcess(base, baseAnalysis, suggestions.tasks));
    if (!rows) setFileName("New BPA");
    toast.success(`Generated ${suggestions.tasks.length} tasks into the diagram`);
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
    // Prepend the UTF-8 BOM so the file byte-matches a real BPM_BPDEFINITION export.
    const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName.replace(/\.csv$/i, "") + "-updated.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

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
          <h1>BPA Designer</h1>
          <p>Map a process visually — place steps, connect them, and export it 1:1 for re-import.</p>
        </div>
        <div className="cia-bpa-actions">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="cia-file-input-hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadFile(f);
              e.target.value = "";
            }}
          />
          <button type="button" className="cia-header-btn" onClick={newBpa}>
            New BPA
          </button>
          <button type="button" className="cia-header-btn" onClick={() => fileRef.current?.click()}>
            {rows ? "Import another" : "Import"}
          </button>
          {rows ? (
            <button type="button" className="cia-header-btn" onClick={downloadCsv}>
              Download CSV
            </button>
          ) : null}
        </div>
      </div>

      <div className="cia-bpa-layout">
        {/* Prompt box — AI generates a starting process into the diagram */}
        <div className="cia-bpa-assist cia-bpa-prompt-top">
          <label className="cia-bpa-assist-label" htmlFor="bpa-prompt">
            Describe a process and AI will generate the steps &amp; decisions into the diagram
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
                  + Generate into diagram
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
            </div>
          ) : null}
        </div>

        {/* Blueprint editor */}
        {model ? (
          <BpaGraph model={model} onChange={onModelChange} />
        ) : (
          <div className="cia-pkg-empty">
            <p>
              <strong>New BPA</strong> to start a blank canvas, <strong>Import</strong> a
              BPM_BPDEFINITION export, or describe a process above and <strong>Generate</strong>. Then
              place steps from the palette, drag between node ports to connect, and download the CSV.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

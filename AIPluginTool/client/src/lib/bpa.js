// Parse a TechnologyOne BPM_BPDEFINITION ("BPA") CSV into tasks and their
// decision items, keeping references back into the original grid so edits and
// new rows export faithfully.
//
// Layout: row 0 = FORMAT line, row 1 = column header, then data rows keyed by
// LineType: BP (process), PT (task), PTA (action/decision on a task), PTAD,
// PTNV. Rows are hierarchical by order — each PTA belongs to the PT above it.

const GUID_ZERO = "00000000-0000-0000-0000-000000000000";

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function analyzeBpa(rows) {
  if (rows.length < 3) return null;
  const header = rows[1];
  const idx = {};
  header.forEach((name, i) => {
    idx[name] = i;
  });
  if (idx.LineType == null || idx.TaskTaskName == null) return null;

  const cell = (r, name) => {
    const i = idx[name];
    return i != null && i < r.length ? r[i] : "";
  };

  const tasks = [];
  let current = null;
  for (let i = 2; i < rows.length; i += 1) {
    const r = rows[i];
    const lt = cell(r, "LineType");
    if (lt === "PT") {
      current = {
        rowIndex: i,
        name: cell(r, "TaskTaskName"),
        type: cell(r, "TaskTaskType"),
        items: [],
      };
      tasks.push(current);
    } else if (lt === "PTA" && current) {
      current.items.push({
        rowIndex: i,
        decision: cell(r, "ActionDecision"),
        description: cell(r, "ActionDescription"),
        type: cell(r, "ActionActionType"),
      });
    }
  }
  return { idx, tasks };
}

export function bpaTaskNames(analysis) {
  return analysis.tasks
    .filter((t) => t.type !== "START" && t.type !== "END")
    .map((t) => t.name)
    .filter(Boolean);
}

export function bpaDecisionLabels(analysis) {
  const set = new Set();
  for (const t of analysis.tasks) for (const it of t.items) if (it.decision) set.add(it.decision);
  return [...set];
}

/** Rename a task in the grid (mutates rows in place). */
export function renameTask(rows, analysis, task, name) {
  rows[task.rowIndex][analysis.idx.TaskTaskName] = name;
  task.name = name;
}

/** Rename a decision item's label (ActionDecision). */
export function renameItem(rows, analysis, item, label) {
  rows[item.rowIndex][analysis.idx.ActionDecision] = label;
  item.decision = label;
}

/**
 * Add a new decision item to a task by cloning its last PTA row, then giving the
 * clone fresh GUIDs, a new sequence, and the new decision label. Returns the new
 * row's index so the UI can refresh. Inserted right after the task's last item.
 */
export function addItem(rows, analysis, task, label) {
  const template = task.items[task.items.length - 1];
  if (!template) return null;
  const src = rows[template.rowIndex];
  const clone = [...src];
  const set = (name, val) => {
    const i = analysis.idx[name];
    if (i != null) clone[i] = val;
  };
  set("ActionActionId", uuid());
  set("ActionDecisionId", uuid());
  set("ActionDecision", label);
  const seqI = analysis.idx.ActionSequence;
  if (seqI != null) {
    const seq = Number.parseInt(src[seqI], 10);
    clone[seqI] = Number.isFinite(seq) ? String(seq + 10) : src[seqI];
  }
  const insertAt = template.rowIndex + 1;
  rows.splice(insertAt, 0, clone);
  return insertAt;
}

/**
 * Build a process scaffold from an AI plan ([{name, items[]}]), reusing the
 * loaded file's rows as templates: clone a USER task (PT) per plan task and a
 * PTA row per decision item, with fresh GUIDs. Returns a NEW rows array with the
 * scaffold inserted before the End task. Branch wiring (the Definition/DiagramData
 * blob) is NOT generated — that must be wired in TechnologyOne.
 */
export function generateProcess(rows, analysis, plan) {
  const idx = analysis.idx;
  const ptTmpl = analysis.tasks.find((t) => t.type === "USER");
  if (!ptTmpl) return rows;
  let ptaTmplIdx = -1;
  for (const t of analysis.tasks) {
    if (t.items.length) {
      ptaTmplIdx = t.items[0].rowIndex;
      break;
    }
  }
  const setCol = (row, name, val) => {
    const i = idx[name];
    if (i != null) row[i] = val;
  };

  const newRows = [];
  for (const task of plan) {
    if (!task.name) continue;
    const pt = [...rows[ptTmpl.rowIndex]];
    setCol(pt, "TaskProcessTaskId", uuid());
    setCol(pt, "TaskTaskName", task.name);
    setCol(pt, "TaskDisplayName", "");
    newRows.push(pt);
    if (ptaTmplIdx >= 0) {
      let seq = 100;
      for (const item of task.items || []) {
        const pa = [...rows[ptaTmplIdx]];
        setCol(pa, "ActionActionId", uuid());
        setCol(pa, "ActionDecisionId", uuid());
        setCol(pa, "ActionDecision", item);
        setCol(pa, "ActionSequence", String(seq));
        seq += 10;
        newRows.push(pa);
      }
    }
  }
  if (!newRows.length) return rows;

  const endTask = analysis.tasks.find((t) => t.type === "END");
  const out = [...rows];
  out.splice(endTask ? endTask.rowIndex : out.length, 0, ...newRows);
  return out;
}

export { GUID_ZERO };

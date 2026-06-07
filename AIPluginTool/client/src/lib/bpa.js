// Parse a TechnologyOne BPM_BPDEFINITION ("BPA") CSV into tasks and their
// decision items, keeping references back into the original grid so edits and
// new rows export faithfully.
//
// Layout: row 0 = FORMAT line, row 1 = column header, then data rows keyed by
// LineType: BP (process), PT (task), PTA (action/decision on a task), PTAD,
// PTNV. Rows are hierarchical by order — each PTA belongs to the PT above it.

const GUID_ZERO = "00000000-0000-0000-0000-000000000000";

// Friendly names for BPA Decision Action types, per the TechnologyOne
// "Introduction to Business Processes – Configuration" doc (§4.10–5.7). The CSV
// stores terse codes (e.g. START_TASK, DOC_ONE); these map them to the labels
// shown in the BPA designer so the config panel reads the same as the software.
const ACTION_TYPE_LABELS = {
  START_TASK: "Trigger Task",
  TRIGGER_TASK: "Trigger Task",
  TRIGGER: "Trigger Task",
  ASSIGNMENT: "Assignment",
  ASSIGN: "Assignment",
  NOTIFICATION: "Send Notification",
  SEND_NOTIFICATION: "Send Notification",
  NOTIFY: "Send Notification",
  EMAIL: "Send Email",
  SEND_EMAIL: "Send Email",
  COMMS: "Communication",
  COMMUNICATION: "Communication",
  DOC_ONE: "Generate Document",
  DOCUMENT: "Generate Document",
  GENERATE_DOCUMENT: "Generate Document",
  ENTITY_SERVICE: "Entity Service",
  SERVICE: "Entity Service",
  TSCRIPT: "TScript",
  ACTION_GROUP: "Action Group",
  WAIT: "Wait",
  CLOCK: "Clock",
};

/** Friendly label for an action type code (falls back to a title-cased code). */
export function actionTypeLabel(type) {
  if (!type) return "Action";
  const key = String(type).trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (ACTION_TYPE_LABELS[key]) return ACTION_TYPE_LABELS[key];
  return String(type)
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

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
  const planTasks = plan.filter((t) => t.name);
  const taskIds = planTasks.map(() => uuid());

  planTasks.forEach((task, ti) => {
    const pt = [...rows[ptTmpl.rowIndex]];
    setCol(pt, "TaskProcessTaskId", taskIds[ti]);
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
  });
  if (!newRows.length) return rows;

  const endTask = analysis.tasks.find((t) => t.type === "END");
  const out = [...rows];
  out.splice(endTask ? endTask.rowIndex : out.length, 0, ...newRows);

  // Keep the diagram in sync: append Nodes + sequential Connections to the BP
  // Definition blob so generated tasks render (and re-import has matching graph).
  const bpIndex = out.findIndex((r, i) => i >= 2 && r[idx.LineType] === "BP");
  if (bpIndex >= 0 && idx.Definition != null) {
    try {
      const def = JSON.parse(out[bpIndex][idx.Definition] || "{}");
      if (!Array.isArray(def.Nodes)) def.Nodes = [];
      let seq = def.Nodes.reduce((m, n) => Math.max(m, Number(n.SequenceNumber) || 0), 0);
      const endNode = def.Nodes.find((n) => (n.Icon || "") === "end");
      planTasks.forEach((task, ti) => {
        seq += 10;
        const nextId = ti < taskIds.length - 1 ? taskIds[ti + 1] : endNode?.Id;
        def.Nodes.push({
          Id: taskIds[ti],
          SourceNodeId: "",
          SequenceNumber: seq,
          Position: {},
          NodeType: "",
          NodeText: task.name,
          Icon: "user",
          Connections: nextId
            ? [
                {
                  Id: ti + 1,
                  ConnectionText: task.items?.[0] || "Proceed",
                  FromNodeId: taskIds[ti],
                  ToNodeId: nextId,
                  IsExpectedDecision: true,
                  Parameters: { ActionId: "", DecisionId: "" },
                },
              ]
            : [],
        });
      });
      const bpRow = [...out[bpIndex]];
      bpRow[idx.Definition] = JSON.stringify(def);
      out[bpIndex] = bpRow;
    } catch {
      /* leave Definition untouched if unparseable */
    }
  }
  return out;
}

/**
 * Build a flow graph from the process Definition blob: nodes (tasks) and edges
 * (decision connections with their action), plus lookups so the UI can show the
 * action(s) within each decision.
 */
export function parseBpaGraph(rows, analysis) {
  const idx = analysis.idx;
  const cell = (r, name) => {
    const i = idx[name];
    return i != null && i < r.length ? r[i] : "";
  };
  const bp = rows.find((r, i) => i >= 2 && cell(r, "LineType") === "BP");
  let def = {};
  try {
    def = JSON.parse(bp ? cell(bp, "Definition") || "{}" : "{}");
  } catch {
    def = {};
  }
  const defNodes = Array.isArray(def.Nodes) ? def.Nodes : [];
  const nodes = defNodes.map((n) => {
    const px = Number(n.Position?.X);
    const py = Number(n.Position?.Y);
    return {
      id: n.Id,
      text: n.NodeText || "",
      icon: n.Icon || "user",
      seq: Number(n.SequenceNumber ?? 0),
      // Saved blueprint position (when the user has dragged/placed the node).
      fx: Number.isFinite(px) && (px !== 0 || py !== 0) ? px : null,
      fy: Number.isFinite(py) && (px !== 0 || py !== 0) ? py : null,
    };
  });
  const edges = [];
  for (const n of defNodes) {
    // The first connection on a task is its default decision (the "Default Path"
    // in the BPA designer follows each task's default decision Start → End).
    (n.Connections || []).forEach((c, ci) => {
      if (!c.ToNodeId) return;
      edges.push({
        from: c.FromNodeId || n.Id,
        to: c.ToNodeId,
        label: c.ConnectionText || "",
        actionId: c.Parameters?.ActionId || "",
        decisionId: c.Parameters?.DecisionId || "",
        expected: Boolean(c.IsExpectedDecision),
        isDefault: ci === 0,
      });
    });
  }

  // Action lookups from PTA rows. A decision (ActionDecisionId) usually groups
  // several actions, so map decisionId -> ordered list.
  const actionsByActionId = {};
  const actionsByDecisionId = {};
  for (let i = 2; i < rows.length; i += 1) {
    const r = rows[i];
    if (cell(r, "LineType") !== "PTA") continue;
    const seq = Number.parseInt(cell(r, "ActionSequence"), 10);
    const a = {
      decision: cell(r, "ActionDecision"),
      type: cell(r, "ActionActionType"),
      description: cell(r, "ActionDescription"),
      actionId: cell(r, "ActionActionId"),
      decisionId: cell(r, "ActionDecisionId"),
      sequence: Number.isFinite(seq) ? seq : 0,
    };
    if (a.actionId) actionsByActionId[a.actionId] = a;
    if (a.decisionId) (actionsByDecisionId[a.decisionId] ||= []).push(a);
  }
  for (const list of Object.values(actionsByDecisionId)) {
    list.sort((x, y) => x.sequence - y.sequence);
  }

  return { nodes, edges, actionsByActionId, actionsByDecisionId };
}

// ---- Editable-blueprint mutations ---------------------------------------
// These operate on the BP `Definition` graph (Nodes + Connections) and keep the
// PT/PTA rows in step so the edited process still exports correctly.

function readDefinition(rows, idx) {
  const bpIndex = rows.findIndex((r, i) => i >= 2 && r[idx.LineType] === "BP");
  if (bpIndex < 0 || idx.Definition == null) return { bpIndex: -1, def: null };
  let def;
  try {
    def = JSON.parse(rows[bpIndex][idx.Definition] || "{}");
  } catch {
    def = {};
  }
  if (!Array.isArray(def.Nodes)) def.Nodes = [];
  return { bpIndex, def };
}

function writeDefinition(rows, idx, bpIndex, def) {
  const out = [...rows];
  const bpRow = [...out[bpIndex]];
  bpRow[idx.Definition] = JSON.stringify(def);
  out[bpIndex] = bpRow;
  return out;
}

/** Add a new task node to the diagram (+ a PT row so it exports). */
export function addTaskNode(rows, analysis, { name = "New Task", position } = {}) {
  const idx = analysis.idx;
  const { bpIndex, def } = readDefinition(rows, idx);
  if (bpIndex < 0) return { rows, nodeId: null };
  const id = uuid();
  const seq = def.Nodes.reduce((m, n) => Math.max(m, Number(n.SequenceNumber) || 0), 0) + 10;
  def.Nodes.push({
    Id: id,
    SourceNodeId: "",
    SequenceNumber: seq,
    Position: position ? { X: Math.round(position.x), Y: Math.round(position.y) } : {},
    NodeType: "",
    NodeText: name,
    Icon: "user",
    Connections: [],
  });
  let out = writeDefinition(rows, idx, bpIndex, def);

  const ptTmpl = analysis.tasks.find((t) => t.type === "USER") || analysis.tasks.find((t) => t.type);
  if (ptTmpl) {
    const pt = [...rows[ptTmpl.rowIndex]];
    const set = (n, v) => {
      const i = idx[n];
      if (i != null) pt[i] = v;
    };
    set("TaskProcessTaskId", id);
    set("TaskTaskName", name);
    set("TaskTaskType", "USER");
    set("TaskDisplayName", "");
    const endTask = analysis.tasks.find((t) => t.type === "END");
    const arr = [...out];
    arr.splice(endTask ? endTask.rowIndex : arr.length, 0, pt);
    out = arr;
  }
  return { rows: out, nodeId: id };
}

/** Connect two task nodes with a decision (+ a PTA Trigger Task action row). */
export function connectNodes(rows, analysis, fromId, toId, label = "Proceed") {
  if (!fromId || !toId || fromId === toId) return rows;
  const idx = analysis.idx;
  const { bpIndex, def } = readDefinition(rows, idx);
  if (bpIndex < 0) return rows;
  const from = def.Nodes.find((n) => n.Id === fromId);
  if (!from) return rows;
  if (!Array.isArray(from.Connections)) from.Connections = [];
  if (from.Connections.some((c) => c.ToNodeId === toId)) return rows;
  const decisionId = uuid();
  const actionId = uuid();
  from.Connections.push({
    Id: from.Connections.length + 1,
    ConnectionText: label,
    FromNodeId: fromId,
    ToNodeId: toId,
    IsExpectedDecision: from.Connections.length === 0,
    Parameters: { ActionId: actionId, DecisionId: decisionId },
  });
  let out = writeDefinition(rows, idx, bpIndex, def);

  // Clone a PTA template into a Trigger Task action under the from task.
  let ptaTmplIdx = -1;
  for (const t of analysis.tasks) {
    if (t.items.length) {
      ptaTmplIdx = t.items[0].rowIndex;
      break;
    }
  }
  const fromPtIndex = out.findIndex(
    (r, i) => i >= 2 && r[idx.LineType] === "PT" && r[idx.TaskProcessTaskId] === fromId,
  );
  if (ptaTmplIdx >= 0 && fromPtIndex >= 0) {
    const pa = [...rows[ptaTmplIdx]];
    const set = (n, v) => {
      const i = idx[n];
      if (i != null) pa[i] = v;
    };
    set("ActionActionId", actionId);
    set("ActionDecisionId", decisionId);
    set("ActionDecision", label);
    set("ActionActionType", "START_TASK");
    set("ActionSequence", "100");
    // insert right after the from task's PT block
    let end = fromPtIndex + 1;
    while (end < out.length && out[end][idx.LineType] !== "PT" && out[end][idx.LineType] !== "BP")
      end += 1;
    const arr = [...out];
    arr.splice(end, 0, pa);
    out = arr;
  }
  return out;
}

/** Rename a node (updates Definition + the matching PT row). */
export function renameNode(rows, analysis, nodeId, text) {
  const idx = analysis.idx;
  const { bpIndex, def } = readDefinition(rows, idx);
  let out = [...rows];
  if (bpIndex >= 0) {
    const n = def.Nodes.find((node) => node.Id === nodeId);
    if (n) n.NodeText = text;
    out = writeDefinition(rows, idx, bpIndex, def);
  }
  const ptIndex = out.findIndex(
    (r, i) => i >= 2 && r[idx.LineType] === "PT" && r[idx.TaskProcessTaskId] === nodeId,
  );
  if (ptIndex >= 0 && idx.TaskTaskName != null) {
    const row = [...out[ptIndex]];
    row[idx.TaskTaskName] = text;
    out[ptIndex] = row;
  }
  return out;
}

/** Delete a node, its connections, and its PT/PTA rows. */
export function deleteNode(rows, analysis, nodeId) {
  const idx = analysis.idx;
  const { bpIndex, def } = readDefinition(rows, idx);
  if (bpIndex < 0) return rows;
  def.Nodes = def.Nodes.filter((n) => n.Id !== nodeId);
  for (const n of def.Nodes) n.Connections = (n.Connections || []).filter((c) => c.ToNodeId !== nodeId);
  let out = writeDefinition(rows, idx, bpIndex, def);
  const ptIndex = out.findIndex(
    (r, i) => i >= 2 && r[idx.LineType] === "PT" && r[idx.TaskProcessTaskId] === nodeId,
  );
  if (ptIndex >= 0) {
    let end = ptIndex + 1;
    while (end < out.length && out[end][idx.LineType] !== "PT" && out[end][idx.LineType] !== "BP")
      end += 1;
    const arr = [...out];
    arr.splice(ptIndex, end - ptIndex);
    out = arr;
  }
  return out;
}

/** Persist a node's dragged position into the Definition so layout sticks. */
export function setNodePosition(rows, analysis, nodeId, x, y) {
  const idx = analysis.idx;
  const { bpIndex, def } = readDefinition(rows, idx);
  if (bpIndex < 0) return rows;
  const n = def.Nodes.find((node) => node.Id === nodeId);
  if (!n) return rows;
  n.Position = { X: Math.round(x), Y: Math.round(y) };
  return writeDefinition(rows, idx, bpIndex, def);
}

/** Rename a connection's decision text (and its PTA decision label). */
export function setConnectionText(rows, analysis, fromId, toId, text) {
  const idx = analysis.idx;
  const { bpIndex, def } = readDefinition(rows, idx);
  if (bpIndex < 0) return rows;
  const from = def.Nodes.find((n) => n.Id === fromId);
  const conn = from?.Connections?.find((c) => c.ToNodeId === toId);
  if (!conn) return rows;
  conn.ConnectionText = text;
  const decisionId = conn.Parameters?.DecisionId;
  let out = writeDefinition(rows, idx, bpIndex, def);
  if (decisionId && idx.ActionDecisionId != null && idx.ActionDecision != null) {
    out = out.map((r, i) =>
      i >= 2 && r[idx.LineType] === "PTA" && r[idx.ActionDecisionId] === decisionId
        ? (() => {
            const row = [...r];
            row[idx.ActionDecision] = text;
            return row;
          })()
        : r,
    );
  }
  return out;
}

/** Delete a connection between two nodes (and its PTA action rows). */
export function deleteConnection(rows, analysis, fromId, toId) {
  const idx = analysis.idx;
  const { bpIndex, def } = readDefinition(rows, idx);
  if (bpIndex < 0) return rows;
  const from = def.Nodes.find((n) => n.Id === fromId);
  if (!from) return rows;
  const conn = (from.Connections || []).find((c) => c.ToNodeId === toId);
  const decisionId = conn?.Parameters?.DecisionId;
  from.Connections = (from.Connections || []).filter((c) => c.ToNodeId !== toId);
  let out = writeDefinition(rows, idx, bpIndex, def);
  if (decisionId && idx.ActionDecisionId != null) {
    out = out.filter(
      (r, i) => !(i >= 2 && r[idx.LineType] === "PTA" && r[idx.ActionDecisionId] === decisionId),
    );
  }
  return out;
}

export { GUID_ZERO };

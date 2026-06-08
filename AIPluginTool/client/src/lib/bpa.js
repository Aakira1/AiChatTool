// Parse a TechnologyOne BPM_BPDEFINITION ("BPA") CSV into tasks and their
// decision items, keeping references back into the original grid so edits and
// new rows export faithfully.
//
// Layout: row 0 = FORMAT line, row 1 = column header, then data rows keyed by
// LineType: BP (process), PT (task), PTA (action/decision on a task), PTAD,
// PTNV. Rows are hierarchical by order — each PTA belongs to the PT above it.

import { BPA_FORMAT_CELL, BPA_HEADER } from "./bpaTemplate.js";

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

// Ordered Decision Action types a user can choose from, per the TechnologyOne
// "Introduction to Business Processes" doc (§4.10–5.7). `hint` is a default
// description so a freshly-added action reads sensibly.
export const ACTION_TYPE_OPTIONS = [
  { type: "START_TASK", label: "Trigger Task", hint: "Trigger the next task" },
  { type: "ASSIGNMENT", label: "Assignment", hint: "Assignment - Automatic - Current person" },
  { type: "NOTIFICATION", label: "Send Notification", hint: "Send a notification to the assigned resource" },
  { type: "EMAIL", label: "Send Email", hint: "Send an email" },
  { type: "DOC_ONE", label: "Generate Document", hint: "Generate a document" },
  { type: "ENTITY_SERVICE", label: "Entity Service", hint: "Run an entity service (validate / submit / save)" },
  { type: "COMMS", label: "Communication", hint: "Send a communication" },
  { type: "TSCRIPT", label: "TScript", hint: "Run a TScript" },
  { type: "ACTION_GROUP", label: "Action Group", hint: "Run an action group" },
  { type: "WAIT", label: "Wait", hint: "Wait for a condition" },
];

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

/**
 * Build a brand-new BPA grid from scratch using the REAL BPM_BPDEFINITION schema
 * (the full 419-column header + exact FORMAT line embedded from a real export):
 * a BP row whose Definition has Start → End wired up, and Start/End tasks. The
 * result parses, renders a diagram, can be grown by the AI generator, and keeps
 * the exact column structure so it re-imports into TechnologyOne. (Behavioural
 * field completeness is still scaffold-grade — finalised in T1.)
 */
export function createEmptyBpa(name = "New BPA") {
  const header = [...BPA_HEADER];
  const idx = {};
  header.forEach((h, i) => {
    idx[h] = i;
  });
  const blank = () => new Array(header.length).fill("");
  const set = (row, col, val) => {
    if (idx[col] != null) row[idx[col]] = val;
  };

  const startId = uuid();
  const endId = uuid();
  const def = {
    Nodes: [
      {
        Id: startId,
        SourceNodeId: "",
        SequenceNumber: 0,
        Position: {},
        NodeType: "",
        NodeText: "Start",
        Icon: "start",
        Connections: [
          {
            Id: 1,
            ConnectionText: "Proceed",
            FromNodeId: startId,
            ToNodeId: endId,
            IsExpectedDecision: true,
            Parameters: { ActionId: "", DecisionId: "" },
          },
        ],
      },
      {
        Id: endId,
        SourceNodeId: "",
        SequenceNumber: 9999,
        Position: {},
        NodeType: "",
        NodeText: "Completed",
        Icon: "end",
        Connections: [],
      },
    ],
  };

  // Row 0 is the single FORMAT cell exactly as the real export writes it.
  const formatRow = [BPA_FORMAT_CELL];

  const bpRow = blank();
  set(bpRow, "LineType", "BP");
  set(bpRow, "ProcessName", name);
  set(bpRow, "Description", name);
  set(bpRow, "Active", "false");
  set(bpRow, "Definition", JSON.stringify(def));

  const startRow = blank();
  set(startRow, "LineType", "PT");
  set(startRow, "TaskProcessTaskId", startId);
  set(startRow, "TaskTaskName", "Start");
  set(startRow, "TaskTaskType", "START");

  const endRow = blank();
  set(endRow, "LineType", "PT");
  set(endRow, "TaskProcessTaskId", endId);
  set(endRow, "TaskTaskName", "Completed");
  set(endRow, "TaskTaskType", "END");

  return [formatRow, header, bpRow, startRow, endRow];
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

  // Friendly extra-detail fields by line type, so an action can show "more
  // layers" (e.g. an Entity Service action's PTAD field-detail rows).
  const detailCols = Object.keys(idx).filter(
    (name) =>
      /^ActDtl/.test(name) &&
      !/SourceActionId|ProcessTaskId|Sequence|DecisionId|ActionId|Id$/.test(name),
  );
  const rowDetails = (r) =>
    detailCols
      .map((name) => ({ field: name.replace(/^ActDtl/, ""), value: cell(r, name) }))
      .filter((d) => d.value !== "");

  const tasks = [];
  let current = null;
  let currentAction = null;
  for (let i = 2; i < rows.length; i += 1) {
    const r = rows[i];
    const lt = cell(r, "LineType");
    if (lt === "PT") {
      current = {
        rowIndex: i,
        name: cell(r, "TaskTaskName"),
        type: cell(r, "TaskTaskType"),
        items: [], // one per PTA action (kept for back-compat)
        decisions: [], // grouped by ActionDecisionId
      };
      currentAction = null;
      tasks.push(current);
    } else if (lt === "PTA" && current) {
      const decisionId = cell(r, "ActionDecisionId");
      const item = {
        rowIndex: i,
        decision: cell(r, "ActionDecision"),
        description: cell(r, "ActionDescription"),
        type: cell(r, "ActionActionType"),
        actionId: cell(r, "ActionActionId"),
        decisionId,
        sequence: Number.parseInt(cell(r, "ActionSequence"), 10) || 0,
        details: [],
      };
      current.items.push(item);
      currentAction = item;
      // Group actions under their decision (so the editor shows it once).
      let group = current.decisions.find((d) => d.decisionId === decisionId && decisionId);
      if (!group) {
        group = { decisionId, label: item.decision, rowIndex: i, actions: [] };
        current.decisions.push(group);
      }
      group.actions.push(item);
    } else if (lt === "PTAD" && currentAction) {
      // Action field-detail row — an extra config layer for the action above.
      currentAction.details.push(...rowDetails(r));
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
 * Add a new decision to a task with the two standard Decision Actions the BPA
 * designer auto-generates (Assignment + Trigger Task), sharing one decision id —
 * matching the real BPM_BPDEFINITION format. Inserted after the task's last
 * action. Returns the first inserted row index so the UI can refresh.
 */
export function addItem(rows, analysis, task, label) {
  const header = rows[1] || [];
  const blankRow = () => new Array(header.length).fill("");
  const setCol = (row, name, val) => {
    const i = analysis.idx[name];
    if (i != null) row[i] = val;
  };
  // Sequence after the task's current highest action sequence.
  let maxSeq = 90;
  for (const it of task.items) {
    const s = Number.parseInt(rows[it.rowIndex]?.[analysis.idx.ActionSequence], 10);
    if (Number.isFinite(s)) maxSeq = Math.max(maxSeq, s);
  }
  const { rows: actionRows } = standardDecisionActions({
    blankRow,
    setCol,
    decisionId: uuid(),
    label,
    targetTaskId: "",
    seqStart: maxSeq + 10,
  });
  // Insert after the task's last existing action (or right after the PT row).
  const lastItem = task.items[task.items.length - 1];
  const insertAt = (lastItem ? lastItem.rowIndex : task.rowIndex) + 1;
  rows.splice(insertAt, 0, ...actionRows);
  return insertAt;
}

/**
 * Build the two standard Decision Actions for a decision that triggers a task,
 * exactly as the BPA designer auto-generates (doc §4.8/4.10): an Assignment
 * (sequenced early) and a Trigger Task (sequenced after it). Returns PTA rows.
 */
function standardDecisionActions({ blankRow, setCol, decisionId, label, targetTaskId, seqStart }) {
  // Trigger Task always comes first, then the Assignment.
  const trigger = blankRow();
  const triggerId = uuid();
  setCol(trigger, "LineType", "PTA");
  setCol(trigger, "ActionActionId", triggerId);
  setCol(trigger, "ActionDecisionId", decisionId);
  setCol(trigger, "ActionDecision", label);
  setCol(trigger, "ActionActionType", "START_TASK");
  setCol(trigger, "ActionDescription", `Trigger Task — ${label}`);
  if (targetTaskId) setCol(trigger, "ActionStartProcessTaskId", targetTaskId);
  setCol(trigger, "ActionSequence", String(seqStart));

  const assign = blankRow();
  setCol(assign, "LineType", "PTA");
  setCol(assign, "ActionActionId", uuid());
  setCol(assign, "ActionDecisionId", decisionId);
  setCol(assign, "ActionDecision", label);
  setCol(assign, "ActionActionType", "ASSIGNMENT");
  setCol(assign, "ActionDescription", "Assignment - Automatic - Current person");
  setCol(assign, "ActionSequence", String(seqStart + 10));

  return { rows: [trigger, assign], triggerActionId: triggerId };
}

/**
 * Build a process scaffold from an AI plan ([{name, items[]}]): a USER task (PT)
 * per plan task, and for each decision the two standard actions (Assignment +
 * Trigger Task) with a shared decision id. Tasks chain Start → … → End, and the
 * BP Definition graph is updated with matching nodes/connections (carrying the
 * decision id so the diagram's config panel shows each decision's actions).
 * Rows use the full BPM_BPDEFINITION schema so the export re-imports.
 */
export function generateProcess(rows, analysis, plan) {
  const idx = analysis.idx;
  const header = rows[1] || [];
  const blankRow = () => new Array(header.length).fill("");
  const setCol = (row, name, val) => {
    const i = idx[name];
    if (i != null) row[i] = val;
  };

  const planTasks = plan.filter((t) => t.name);
  if (!planTasks.length) return rows;
  const taskIds = planTasks.map(() => uuid());

  // Resolve the End node id up front so the last task's trigger targets it.
  const bpIndex = rows.findIndex((r, i) => i >= 2 && r[idx.LineType] === "BP");
  let endNodeId = null;
  if (bpIndex >= 0 && idx.Definition != null) {
    try {
      const def = JSON.parse(rows[bpIndex][idx.Definition] || "{}");
      endNodeId = (def.Nodes || []).find((n) => (n.Icon || "") === "end")?.Id ?? null;
    } catch {
      /* ignore */
    }
  }

  // Structured plan: each task → its decisions (label + shared decision id).
  const built = planTasks.map((task, ti) => {
    const labels = task.items?.length ? task.items : ["Proceed"];
    return {
      id: taskIds[ti],
      name: task.name,
      nextId: ti < taskIds.length - 1 ? taskIds[ti + 1] : endNodeId,
      decisions: labels.map((label) => ({ label, decisionId: uuid() })),
    };
  });

  const newRows = [];
  for (const t of built) {
    const pt = blankRow();
    setCol(pt, "LineType", "PT");
    setCol(pt, "TaskTaskType", "USER");
    setCol(pt, "TaskProcessTaskId", t.id);
    setCol(pt, "TaskTaskName", t.name);
    newRows.push(pt);
    let seq = 100;
    t.decisions.forEach((d, di) => {
      // The first (default) decision triggers the next task in the chain.
      const target = di === 0 ? t.nextId : "";
      const { rows: actionRows, triggerActionId } = standardDecisionActions({
        blankRow,
        setCol,
        decisionId: d.decisionId,
        label: d.label,
        targetTaskId: target,
        seqStart: seq,
      });
      d.triggerActionId = triggerActionId;
      newRows.push(...actionRows);
      seq += 20;
    });
  }

  const endTask = analysis.tasks.find((t) => t.type === "END");
  const out = [...rows];
  out.splice(endTask ? endTask.rowIndex : out.length, 0, ...newRows);

  // Sync the diagram: repoint whatever currently lands on End into the first new
  // task, then add a node per task with a connection carrying the decision id.
  if (bpIndex >= 0 && idx.Definition != null) {
    try {
      const def = JSON.parse(out[bpIndex][idx.Definition] || "{}");
      if (!Array.isArray(def.Nodes)) def.Nodes = [];
      let seq = def.Nodes.reduce((m, n) => Math.max(m, Number(n.SequenceNumber) || 0), 0);
      const endNode = def.Nodes.find((n) => (n.Icon || "") === "end");
      if (endNode && taskIds.length) {
        for (const n of def.Nodes) {
          for (const c of n.Connections || []) {
            if (c.ToNodeId === endNode.Id) c.ToNodeId = taskIds[0];
          }
        }
      }
      let connId = def.Nodes.reduce(
        (m, n) => Math.max(m, ...(n.Connections || []).map((c) => Number(c.Id) || 0)),
        0,
      );
      built.forEach((t) => {
        seq += 10;
        const d0 = t.decisions[0];
        def.Nodes.push({
          Id: t.id,
          SourceNodeId: "",
          SequenceNumber: seq,
          Position: {},
          NodeType: "",
          NodeText: t.name,
          Icon: "user",
          Connections: t.nextId
            ? [
                {
                  Id: (connId += 1),
                  ConnectionText: d0.label,
                  FromNodeId: t.id,
                  ToNodeId: t.nextId,
                  IsExpectedDecision: true,
                  Parameters: { ActionId: d0.triggerActionId || "", DecisionId: d0.decisionId },
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
 * Append a Decision Action to an existing decision (by its ActionDecisionId),
 * matching the real format. Returns a NEW rows array with the PTA inserted after
 * the decision's last action. Used by the diagram to add actions like the BPA
 * designer does.
 */
export function addAction(rows, analysis, decisionId, actionType, description) {
  const idx = analysis.idx;
  const header = rows[1] || [];
  let lastIdx = -1;
  let label = "";
  let maxSeq = 90;
  for (let i = 2; i < rows.length; i += 1) {
    if (rows[i][idx.LineType] !== "PTA") continue;
    if (rows[i][idx.ActionDecisionId] !== decisionId) continue;
    lastIdx = i;
    label = rows[i][idx.ActionDecision] || label;
    const s = Number.parseInt(rows[i][idx.ActionSequence], 10);
    if (Number.isFinite(s)) maxSeq = Math.max(maxSeq, s);
  }
  if (lastIdx < 0) return rows;
  const row = new Array(header.length).fill("");
  const setCol = (name, val) => {
    const i = idx[name];
    if (i != null) row[i] = val;
  };
  setCol("LineType", "PTA");
  setCol("ActionActionId", uuid());
  setCol("ActionDecisionId", decisionId);
  setCol("ActionDecision", label);
  setCol("ActionActionType", actionType);
  setCol("ActionDescription", description || actionTypeLabel(actionType));
  setCol("ActionSequence", String(maxSeq + 10));
  const out = [...rows];
  out.splice(lastIdx + 1, 0, row);
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
  // several actions, so map decisionId -> ordered list. PTAD rows that follow a
  // PTA are that action's extra config layers (e.g. Entity Service field details).
  const detailCols = Object.keys(idx).filter(
    (name) =>
      /^ActDtl/.test(name) &&
      !/SourceActionId|ProcessTaskId|Sequence|DecisionId|ActionId|Id$/.test(name),
  );
  const rowDetails = (r) =>
    detailCols
      .map((name) => ({ field: name.replace(/^ActDtl/, ""), value: cell(r, name) }))
      .filter((d) => d.value !== "");

  const actionsByActionId = {};
  const actionsByDecisionId = {};
  let currentAction = null;
  for (let i = 2; i < rows.length; i += 1) {
    const r = rows[i];
    const lt = cell(r, "LineType");
    if (lt === "PTA") {
      const seq = Number.parseInt(cell(r, "ActionSequence"), 10);
      const a = {
        decision: cell(r, "ActionDecision"),
        type: cell(r, "ActionActionType"),
        description: cell(r, "ActionDescription"),
        actionId: cell(r, "ActionActionId"),
        decisionId: cell(r, "ActionDecisionId"),
        sequence: Number.isFinite(seq) ? seq : 0,
        details: [],
      };
      currentAction = a;
      if (a.actionId) actionsByActionId[a.actionId] = a;
      if (a.decisionId) (actionsByDecisionId[a.decisionId] ||= []).push(a);
    } else if (lt === "PTAD" && currentAction) {
      currentAction.details.push(...rowDetails(r));
    } else if (lt === "PT") {
      currentAction = null;
    }
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

/**
 * Connect two task nodes with a decision, adding the two standard actions
 * (Trigger Task first, then Assignment) under the from task — matching the real
 * format. Returns a NEW rows array.
 */
export function connectNodes(rows, analysis, fromId, toId, label = "Proceed") {
  if (!fromId || !toId || fromId === toId) return rows;
  const idx = analysis.idx;
  const header = rows[1] || [];
  const blankRow = () => new Array(header.length).fill("");
  const setCol = (row, name, val) => {
    const i = idx[name];
    if (i != null) row[i] = val;
  };
  const { bpIndex, def } = readDefinition(rows, idx);
  if (bpIndex < 0) return rows;
  const from = def.Nodes.find((n) => n.Id === fromId);
  if (!from) return rows;
  if (!Array.isArray(from.Connections)) from.Connections = [];
  if (from.Connections.some((c) => c.ToNodeId === toId)) return rows;

  // The Start task has no user decision — its outgoing link is a plain trigger,
  // so it carries no Decision Actions (no PTA rows, no decision id).
  const isStartFrom = (from.Icon || "") === "start";
  let actionRows = [];
  let triggerActionId = "";
  let decisionId = "";
  if (!isStartFrom) {
    decisionId = uuid();
    const built = standardDecisionActions({
      blankRow,
      setCol,
      decisionId,
      label,
      targetTaskId: toId,
      seqStart: 100,
    });
    actionRows = built.rows;
    triggerActionId = built.triggerActionId;
  }

  from.Connections.push({
    Id: from.Connections.length + 1,
    ConnectionText: isStartFrom ? "Proceed" : label,
    FromNodeId: fromId,
    ToNodeId: toId,
    IsExpectedDecision: from.Connections.length === 0,
    Parameters: { ActionId: triggerActionId, DecisionId: decisionId },
  });
  let out = writeDefinition(rows, idx, bpIndex, def);

  // Insert the action rows (if any) right after the from task's PT block.
  if (actionRows.length) {
    const fromPtIndex = out.findIndex(
      (r, i) => i >= 2 && r[idx.LineType] === "PT" && r[idx.TaskProcessTaskId] === fromId,
    );
    if (fromPtIndex >= 0) {
      let end = fromPtIndex + 1;
      while (end < out.length && out[end][idx.LineType] !== "PT" && out[end][idx.LineType] !== "BP")
        end += 1;
      const arr = [...out];
      arr.splice(end, 0, ...actionRows);
      out = arr;
    }
  }
  return out;
}

/**
 * Rename a decision in the graph: updates the connection's ConnectionText and
 * every PTA action's ActionDecision that shares the decision id.
 */
export function renameDecision(rows, analysis, decisionId, label) {
  if (!decisionId) return rows;
  const idx = analysis.idx;
  const { bpIndex, def } = readDefinition(rows, idx);
  let out = [...rows];
  if (bpIndex >= 0) {
    for (const n of def.Nodes) {
      for (const c of n.Connections || []) {
        if (c.Parameters?.DecisionId === decisionId) c.ConnectionText = label;
      }
    }
    out = writeDefinition(out, idx, bpIndex, def);
  }
  const col = idx.ActionDecision;
  if (col != null) {
    out = out.map((r, i) =>
      i >= 2 && r[idx.LineType] === "PTA" && r[idx.ActionDecisionId] === decisionId
        ? r.map((v, ci) => (ci === col ? label : v))
        : r,
    );
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

// ---- Blueprint editor model bridge --------------------------------------
// The graph editor works on a free-form { nodes, connections } model (like the
// Process Mapper). These convert to/from the BP Definition and regenerate the
// PT/PTA rows on save, so the CSV export stays a valid BPM_BPDEFINITION.

const NODE_KINDS = ["start", "end", "task", "doc-task", "subprocess", "decision", "annotation"];

function typeOfNode(n) {
  if (NODE_KINDS.includes(n.NodeType)) return n.NodeType;
  const icon = n.Icon || "";
  if (icon === "start") return "start";
  if (icon === "end") return "end";
  if (icon === "doc") return "doc-task";
  if (icon === "decision") return "decision";
  if (icon === "subprocess") return "subprocess";
  if (icon === "annotation") return "annotation";
  return "task";
}
function iconOfType(type) {
  if (type === "start") return "start";
  if (type === "end") return "end";
  if (type === "doc-task") return "doc";
  if (type === "decision") return "decision";
  if (type === "subprocess") return "subprocess";
  if (type === "annotation") return "annotation";
  return "user";
}

/** Lay out nodes left→right by BFS when the Definition carries no positions. */
function autoLayoutModel(nodes, connections) {
  const incoming = new Set(connections.map((c) => c.toId));
  let roots = nodes.filter((n) => !incoming.has(n.id));
  if (!roots.length && nodes.length) roots = [nodes[0]];
  const col = new Map();
  const q = roots.map((n) => ({ id: n.id, c: 0 }));
  q.forEach(({ id, c }) => col.set(id, c));
  const seen = new Set();
  while (q.length) {
    const { id, c } = q.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const cn of connections.filter((x) => x.fromId === id)) {
      const nc = c + 1;
      if (!col.has(cn.toId) || col.get(cn.toId) < nc) {
        col.set(cn.toId, nc);
        q.push({ id: cn.toId, c: nc });
      }
    }
  }
  nodes.forEach((n) => {
    if (!col.has(n.id)) col.set(n.id, 0);
  });
  const rowsByCol = new Map();
  for (const n of nodes) {
    const c = col.get(n.id);
    if (!rowsByCol.has(c)) rowsByCol.set(c, 0);
    n.x = 60 + c * 240;
    n.y = 60 + rowsByCol.get(c) * 120;
    rowsByCol.set(c, rowsByCol.get(c) + 1);
  }
}

/** Build the editor model from the loaded BPA rows. */
export function bpaToModel(rows, analysis) {
  const idx = analysis.idx;
  const { def } = readDefinition(rows, idx);
  const defNodes = Array.isArray(def?.Nodes) ? def.Nodes : [];
  const nodes = defNodes.map((n) => ({
    id: n.Id,
    type: typeOfNode(n),
    x: Number(n.Position?.X) || 0,
    y: Number(n.Position?.Y) || 0,
    label: n.NodeText || "",
    assignee: n.Assignee || "",
  }));
  let cseq = 0;
  const connections = [];
  for (const n of defNodes) {
    for (const c of n.Connections || []) {
      if (!c.ToNodeId) continue;
      cseq += 1;
      connections.push({
        id: c.Uid || `c${cseq}`,
        fromId: c.FromNodeId || n.Id,
        toId: c.ToNodeId,
        fromSide: c.FromSide || "right",
        toSide: c.ToSide || "left",
        label: c.ConnectionText || "",
        waypoints: (c.Waypoints || []).map((w) => ({ x: Number(w.X) || 0, y: Number(w.Y) || 0 })),
        decisionId: c.Parameters?.DecisionId || "",
        actionId: c.Parameters?.ActionId || "",
      });
    }
  }
  // Attach each connection's Decision Actions from its PTA rows so they're
  // editable in the panel (grouped by ActionDecisionId, ordered by sequence).
  const actionsByDecision = {};
  for (let i = 2; i < rows.length; i += 1) {
    const r = rows[i];
    if (r[idx.LineType] !== "PTA") continue;
    const did = r[idx.ActionDecisionId];
    if (!did) continue;
    const seqN = Number.parseInt(r[idx.ActionSequence], 10);
    (actionsByDecision[did] ||= []).push({
      type: r[idx.ActionActionType] || "",
      description: r[idx.ActionDescription] || "",
      sequence: Number.isFinite(seqN) ? seqN : 0,
    });
  }
  for (const list of Object.values(actionsByDecision)) list.sort((a, b) => a.sequence - b.sequence);
  for (const c of connections) {
    c.actions = (c.decisionId && actionsByDecision[c.decisionId]) || [];
  }

  // No saved positions yet → auto-arrange so nodes don't stack on each other.
  if (nodes.length && nodes.every((n) => n.x === 0 && n.y === 0)) {
    autoLayoutModel(nodes, connections);
  }
  return { nodes, connections };
}

/** Write the editor model back into the rows (Definition + regenerated PT/PTA). */
export function modelToRows(rows, analysis, model) {
  const idx = analysis.idx;
  const header = rows[1] || [];
  const blank = () => new Array(header.length).fill("");
  const setCol = (r, name, val) => {
    const i = idx[name];
    if (i != null) r[i] = val;
  };

  // Ensure every non-start connection has stable decision/action ids.
  const startIds = new Set(model.nodes.filter((n) => n.type === "start").map((n) => n.id));
  for (const c of model.connections) {
    if (startIds.has(c.fromId)) {
      c.decisionId = "";
      c.actionId = "";
    } else {
      if (!c.decisionId) c.decisionId = uuid();
      if (!c.actionId) c.actionId = uuid();
    }
  }

  // Definition nodes + connections (carrying side/waypoint UI metadata).
  let seq = 0;
  const defNodes = model.nodes.map((nd) => {
    seq += 10;
    const conns = model.connections
      .filter((c) => c.fromId === nd.id)
      .map((c, ci) => ({
        Id: ci + 1,
        Uid: c.id,
        ConnectionText: c.label,
        FromNodeId: nd.id,
        ToNodeId: c.toId,
        FromSide: c.fromSide,
        ToSide: c.toSide,
        Waypoints: (c.waypoints || []).map((w) => ({ X: Math.round(w.x), Y: Math.round(w.y) })),
        IsExpectedDecision: ci === 0,
        Parameters: { ActionId: c.actionId || "", DecisionId: c.decisionId || "" },
      }));
    return {
      Id: nd.id,
      SourceNodeId: "",
      SequenceNumber: nd.type === "end" ? 9999 : seq,
      Position: { X: Math.round(nd.x), Y: Math.round(nd.y) },
      NodeType: nd.type,
      NodeText: nd.label,
      Icon: iconOfType(nd.type),
      Assignee: nd.assignee || "",
      Connections: conns,
    };
  });
  const def = { Nodes: defNodes };

  const out = [rows[0], rows[1]];
  const bpIndex = rows.findIndex((r, i) => i >= 2 && r[idx.LineType] === "BP");
  const bpRow = bpIndex >= 0 ? [...rows[bpIndex]] : blank();
  if (bpIndex < 0) setCol(bpRow, "LineType", "BP");
  setCol(bpRow, "Definition", JSON.stringify(def));
  out.push(bpRow);

  // Regenerate PT/PTA from the model (annotations carry no task row).
  for (const nd of model.nodes) {
    if (nd.type === "annotation") continue;
    const pt = blank();
    setCol(pt, "LineType", "PT");
    setCol(pt, "TaskProcessTaskId", nd.id);
    setCol(pt, "TaskTaskName", nd.label);
    setCol(pt, "TaskTaskType", nd.type === "start" ? "START" : nd.type === "end" ? "END" : "USER");
    out.push(pt);
    if (nd.type === "start") continue;
    for (const c of model.connections.filter((x) => x.fromId === nd.id)) {
      const label = c.label || "Proceed";
      // Use the connection's own action list; default to the standard two.
      const acts =
        c.actions && c.actions.length
          ? c.actions
          : [
              { type: "START_TASK", description: `Trigger Task — ${label}` },
              { type: "ASSIGNMENT", description: "Assignment - Automatic - Current person" },
            ];
      let s = 100;
      acts.forEach((act, ai) => {
        const pa = blank();
        setCol(pa, "LineType", "PTA");
        setCol(pa, "ActionActionId", ai === 0 ? c.actionId || uuid() : uuid());
        setCol(pa, "ActionDecisionId", c.decisionId);
        setCol(pa, "ActionDecision", label);
        setCol(pa, "ActionActionType", act.type || "START_TASK");
        setCol(pa, "ActionDescription", act.description || actionTypeLabel(act.type));
        if ((act.type || "START_TASK") === "START_TASK") setCol(pa, "ActionStartProcessTaskId", c.toId);
        setCol(pa, "ActionSequence", String(s));
        out.push(pa);
        s += 10;
      });
    }
  }
  return out;
}

export { GUID_ZERO };

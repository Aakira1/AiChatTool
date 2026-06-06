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

  // Also update the BP Definition graph so the diagram renders the new tasks.
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
        const connections = nextId
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
          : [];
        def.Nodes.push({
          Id: taskIds[ti],
          SourceNodeId: "",
          SequenceNumber: seq,
          Position: {},
          NodeType: "",
          NodeText: task.name,
          Icon: "user",
          Connections: connections,
        });
      });
      const bpRow = [...out[bpIndex]];
      bpRow[idx.Definition] = JSON.stringify(def);
      out[bpIndex] = bpRow;
    } catch {
      /* leave Definition untouched if it isn't parseable */
    }
  }
  return out;
}

// Built-in BPA workflow templates derived from the TechnologyOne BPM project
// design — each is an ordered set of tasks (statuses) with a forward decision.
export const BPA_TEMPLATES = [
  {
    id: "standard-dev",
    label: "Standard Development",
    tasks: [
      "Pending",
      "Dev Spec",
      "Dev Ready",
      "Active",
      "Development Complete",
      "Functional QA",
      "Analyst QA",
      "ITQA",
      "Release Merge",
      "Release QA",
      "Closed",
    ].map((name, i, a) => ({ name, items: [i < a.length - 1 ? "Proceed" : "Done"] })),
  },
  {
    id: "epic",
    label: "Epic",
    tasks: ["Pending", "Research", "Design", "Manufacture", "Prove", "Closed"].map((name, i, a) => ({
      name,
      items: [i < a.length - 1 ? "Proceed" : "Done"],
    })),
  },
  {
    id: "change-request",
    label: "Change Request",
    tasks: ["Pending", "In Progress", "RPO Review", "GM Review", "CTO Review", "Closed"].map(
      (name, i, a) => ({ name, items: [i < a.length - 1 ? "Approve" : "Done"] }),
    ),
  },
  {
    id: "customer-request",
    label: "Customer Request",
    tasks: ["Pending", "Active", "Closed"].map((name, i, a) => ({
      name,
      items: [i < a.length - 1 ? "Proceed" : "Done"],
    })),
  },
  {
    id: "rd-artefact",
    label: "R&D Artefact",
    tasks: ["Pending", "In Progress", "Awaiting Sign-off", "Closed"].map((name, i, a) => ({
      name,
      items: [i < a.length - 1 ? "Submit" : "Done"],
    })),
  },
  {
    id: "product-success",
    label: "Product Success",
    tasks: ["Pending", "Active", "In Review", "Closed"].map((name, i, a) => ({
      name,
      items: [i < a.length - 1 ? "Proceed" : "Done"],
    })),
  },
  {
    id: "compliance",
    label: "Compliance",
    tasks: ["Pending", "Provided", "Reviewed", "Closed"].map((name, i, a) => ({
      name,
      items: [i < a.length - 1 ? "Proceed" : "Done"],
    })),
  },
  {
    id: "acceptance",
    label: "Acceptance",
    tasks: ["Pending", "Tested", "Failed", "Closed"].map((name, i, a) => ({
      name,
      items: [i < a.length - 1 ? "Check" : "Done"],
    })),
  },
];

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
  const nodes = defNodes.map((n) => ({
    id: n.Id,
    text: n.NodeText || "",
    icon: n.Icon || "user",
    seq: Number(n.SequenceNumber ?? 0),
  }));
  const edges = [];
  for (const n of defNodes) {
    for (const c of n.Connections || []) {
      if (!c.ToNodeId) continue;
      edges.push({
        from: c.FromNodeId || n.Id,
        to: c.ToNodeId,
        label: c.ConnectionText || "",
        actionId: c.Parameters?.ActionId || "",
        decisionId: c.Parameters?.DecisionId || "",
        expected: Boolean(c.IsExpectedDecision),
      });
    }
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

export { GUID_ZERO };

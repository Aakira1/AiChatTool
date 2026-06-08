// Understands an implementation "companion" CSV (Functional Group / Task Group /
// Task / % Completed & Status / Date Completed / …). Locates the header row,
// maps the columns, and extracts task items that reference their source row so
// edits can be written back into the original grid for export.

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

export const STATUS_TEXT = {
  "not-started": "",
  "in-progress": "IN PROGRESS",
  completed: "100% - COMPLETED",
};

export function statusState(value) {
  const s = norm(value);
  if (/100%|complete/.test(s)) return "completed";
  if (/\d{1,3}\s*%|in progress|progress|started|wip/.test(s)) return "in-progress";
  return "not-started";
}

export function analyzeChecklist(rows) {
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].some((c) => norm(c) === "functional group")) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex < 0) return null;

  const header = rows[headerIndex];
  const find = (re) => header.findIndex((c) => re.test(norm(c)));
  const cols = {
    functionalGroup: find(/^functional group$/),
    taskGroup: find(/^task group$/),
    task: find(/^task$/),
    status: find(/completed.*status|% completed|^status$/),
    date: find(/date completed/),
    responsible: find(/responsible/),
    scheduleResource: find(/investment schedule|schedule resource/),
    notes: find(/notes|comment|direction/),
    links: find(/links/),
  };
  if (cols.task < 0) return null;

  const items = [];
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const r = rows[i];
    const task = cols.task >= 0 ? r[cols.task] : "";
    if (!task || !task.trim()) continue;
    const at = (idx) => (idx >= 0 ? (r[idx] ?? "").trim() : "");
    // Skip stage/section banner rows where Functional Group = Task Group = Task
    // (e.g. "STAGE 1A - Ci Sync & Environment Set up") — these are headings.
    const fgRaw = at(cols.functionalGroup);
    const tgRaw = at(cols.taskGroup);
    if (fgRaw && norm(task) === norm(fgRaw) && norm(task) === norm(tgRaw)) continue;
    items.push({
      rowIndex: i,
      functionalGroup: at(cols.functionalGroup),
      taskGroup: at(cols.taskGroup),
      task: task.trim(),
      status: cols.status >= 0 ? r[cols.status] ?? "" : "",
      date: at(cols.date),
      responsible: at(cols.responsible),
      scheduleResource: at(cols.scheduleResource),
      notes: at(cols.notes),
      links: at(cols.links),
    });
  }
  if (!items.length) return null;
  return { headerIndex, cols, items };
}

/** Group items by Functional Group → Task Group, preserving first-seen order. */
export function groupItems(items) {
  const groups = [];
  const byFg = new Map();
  for (const item of items) {
    const fgName = item.functionalGroup || "Other";
    if (!byFg.has(fgName)) {
      const fg = { name: fgName, taskGroups: [], _byTg: new Map() };
      byFg.set(fgName, fg);
      groups.push(fg);
    }
    const fg = byFg.get(fgName);
    const tgName = item.taskGroup || "—";
    if (!fg._byTg.has(tgName)) {
      const tg = { name: tgName, items: [] };
      fg._byTg.set(tgName, tg);
      fg.taskGroups.push(tg);
    }
    fg._byTg.get(tgName).items.push(item);
  }
  return groups;
}

export function progressOf(items) {
  const total = items.length;
  const completed = items.filter((i) => statusState(i.status) === "completed").length;
  const inProgress = items.filter((i) => statusState(i.status) === "in-progress").length;
  return { total, completed, inProgress, pct: total ? Math.round((completed / total) * 100) : 0 };
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

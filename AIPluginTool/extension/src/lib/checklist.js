// Self-contained CSV + companion-checklist helpers for the side panel.

export function parseCsv(text) {
  const s = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function toCsv(rows) {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const v = String(cell ?? "");
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(","),
    )
    .join("\r\n");
}

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
  };
  if (cols.task < 0) return null;

  const items = [];
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const r = rows[i];
    const task = r[cols.task];
    if (!task || !task.trim()) continue;
    const at = (idx) => (idx >= 0 ? (r[idx] ?? "").trim() : "");
    // Skip stage/section banner rows (Functional Group = Task Group = Task).
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
    });
  }
  if (!items.length) return null;
  return { headerIndex, cols, items };
}

export function groupItems(items) {
  const groups = [];
  const byFg = new Map();
  for (const item of items) {
    const fgName = item.functionalGroup || "Other";
    if (!byFg.has(fgName)) {
      const fg = { name: fgName, items: [] };
      byFg.set(fgName, fg);
      groups.push(fg);
    }
    byFg.get(fgName).items.push(item);
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

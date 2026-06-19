// Parser + helpers for the Go-Live Checklist app. Unlike the Companion (which
// expects a Functional Group / Task / Status layout) this understands the
// step-by-step go-live run sheets used for P&R transitions and DxP:
//
//   • P&R "Go Live Checklist": Task No. | Date | Time | Duration | Category |
//     Status | Task Description | Owner | Resource, with full-width phase banner
//     rows ("PREPARATION…", "Go-live Production Activities Commence…").
//   • DxP "Go Live Run Sheet": No. | Date/Time Completed | Task | Dependency |
//     Assignee (no phase banners).
//
// Tasks are grouped by phase; Category / Owner / Resource power the filters.

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

export const STATUS_TEXT = {
  "not-started": "Not Started",
  "in-progress": "In Progress",
  completed: "Completed",
};

// Note: "Not Started" contains "started", so check the negative case explicitly
// BEFORE the in-progress markers or every fresh task reads as in-progress.
export function statusState(value) {
  const s = norm(value);
  if (!s) return "not-started";
  if (/100\s*%|completed|complete|done|finished|✓|☑/.test(s)) return "completed";
  if (/not[\s-]*started|to[\s-]*do|^pending$|^n\/?a$/.test(s)) return "not-started";
  if (/\d{1,3}\s*%|in[\s-]*progress|progress|wip|started|underway|ongoing|doing/.test(s)) return "in-progress";
  return "not-started";
}

export function nextStatusState(state) {
  return state === "not-started" ? "in-progress" : state === "in-progress" ? "completed" : "not-started";
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

// "Owner type" used by the filter — prefer Resource, then Assignee, then Owner.
export function ownerField(items) {
  if (items.some((it) => it.resource)) return "resource";
  if (items.some((it) => it.assignee)) return "assignee";
  return "owner";
}

/** Detect the run-sheet layout in a sheet's rows. Returns null if not a run sheet. */
export function analyzeRunSheet(rows) {
  let headerIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i += 1) {
    const cells = rows[i].map(norm);
    const hasTask = cells.some((c) => /task description|^task$|^task\/activity$/.test(c));
    const hasMarker = cells.some((c) => /^status$|^status\b|assignee|^owner$/.test(c));
    if (hasTask && hasMarker) { headerIndex = i; break; }
  }
  if (headerIndex < 0) return null;

  const header = rows[headerIndex];
  const find = (re) => header.findIndex((c) => re.test(norm(c)));
  const cols = {
    taskNo: find(/task no|^no\.?$|^#$|^step$/),
    date: find(/date.*completed|date\/time|^date$/),
    time: find(/^time/),
    duration: find(/duration/),
    category: find(/category|^type$/),
    status: find(/^status/),
    task: find(/task description|^task$|^task\/activity$/),
    owner: find(/^owner$/),
    resource: find(/resource/),
    assignee: find(/assignee/),
    dependency: find(/dependency|depends/),
    notes: find(/notes|comment/),
  };
  if (cols.task < 0) return null;

  const items = [];
  let phase = "";
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const r = rows[i];
    const at = (idx) => (idx >= 0 ? clean(r[idx]) : "");
    const task = at(cols.task);

    if (!task) {
      // A banner / phase row: text somewhere on the line but no task description.
      const firstText = r.map(clean).find((c) => c && !/^\d+$/.test(c));
      const looksLikeData = at(cols.status) || at(cols.owner) || at(cols.resource);
      if (firstText && !looksLikeData) phase = firstText;
      continue;
    }

    items.push({
      rowIndex: i,
      taskNo: at(cols.taskNo),
      phase: phase || "Tasks",
      category: at(cols.category),
      task,
      // Some run sheets (e.g. DxP) have no Status column — a filled "Date/Time
      // Completed" is the only completion signal, so derive status from it.
      status: cols.status >= 0 ? clean(r[cols.status]) : at(cols.date) ? "Completed" : "",
      date: at(cols.date),
      time: at(cols.time),
      duration: at(cols.duration),
      owner: at(cols.owner),
      resource: at(cols.resource),
      assignee: at(cols.assignee),
      dependency: at(cols.dependency),
      notes: at(cols.notes),
    });
  }
  if (!items.length) return null;
  return { headerIndex, cols, items };
}

/** Group items by phase, preserving first-seen order. */
export function groupByPhase(items) {
  const groups = [];
  const byPhase = new Map();
  for (const item of items) {
    const name = item.phase || "Tasks";
    if (!byPhase.has(name)) {
      const g = { name, items: [] };
      byPhase.set(name, g);
      groups.push(g);
    }
    byPhase.get(name).items.push(item);
  }
  return groups;
}

// ── Format-preserving Excel export ───────────────────────────────────────────
// Same surgical approach as the Companion: edit only the changed Status / Date /
// Notes cells inside the original workbook XML, leaving styling byte-for-byte.

function colLetter(c) {
  let s = "";
  let n = c + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
function colToNum(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
function xmlEscape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export function bytesToBase64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < arr.length; i += 0x8000) bin += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function base64ToBytes(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  return arr;
}

function setCellInSheetXml(xml, addr, value, rowNum) {
  const re = new RegExp(`<c r="${addr}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  const m = xml.match(re);
  const sAttr = m ? (m[1].match(/\ss="\d+"/)?.[0] || "") : "";
  const hasVal = value !== "" && value != null;
  const cell = hasVal
    ? `<c r="${addr}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
    : `<c r="${addr}"${sAttr}/>`;
  if (m) return xml.replace(re, cell);

  const rowRe = new RegExp(`(<row r="${rowNum}"[^>]*>)([\\s\\S]*?)(</row>)`);
  const rm = xml.match(rowRe);
  if (!rm) return xml;
  const colNum = colToNum(addr.match(/[A-Z]+/)[0]);
  let insertAt = rm[2].length;
  for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"[\s\S]*?(?:\/>|<\/c>)/g)) {
    if (colToNum(cm[1]) > colNum) { insertAt = cm.index; break; }
  }
  const inner = rm[2].slice(0, insertAt) + cell + rm[2].slice(insertAt);
  return xml.replace(rowRe, `${rm[1]}${inner}${rm[3]}`);
}

/**
 * Re-serialise the original workbook, rewriting only the editable cells (status,
 * date, notes) for each stage. `stages` carries { name, rows, analysis, rowOffset,
 * colOffset }.
 */
export async function exportPreservingFormat(originalBytes, stages) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(originalBytes);

  const wbXml = await zip.file("xl/workbook.xml").async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const relMap = {};
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2];
  const nameToPath = {};
  for (const m of wbXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const name = m[0].match(/name="([^"]+)"/)?.[1];
    const rid = m[0].match(/r:id="([^"]+)"/)?.[1];
    if (!name || !rid) continue;
    let target = relMap[rid];
    if (target) {
      target = target.replace(/^\//, "");
      if (!target.startsWith("xl/")) target = `xl/${target}`;
      nameToPath[name] = target;
    }
  }

  for (const s of stages) {
    const path = nameToPath[s.name];
    const f = path && zip.file(path);
    if (!f) continue;
    let xml = await f.async("string");
    const { cols } = s.analysis;
    const r0 = s.rowOffset ?? 0;
    const c0 = s.colOffset ?? 0;

    const changes = new Map();
    for (const item of s.analysis.items) {
      const rowNum = r0 + item.rowIndex + 1;
      [cols.status, cols.date, cols.notes].forEach((col) => {
        if (col >= 0) changes.set(colLetter(c0 + col) + rowNum, s.rows[item.rowIndex][col]);
      });
    }

    const seen = new Set();
    xml = xml.replace(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g, (full, addr, attrs) => {
      if (!changes.has(addr)) return full;
      seen.add(addr);
      const sAttr = attrs.match(/\ss="\d+"/)?.[0] || "";
      const value = changes.get(addr);
      return value !== "" && value != null
        ? `<c r="${addr}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
        : `<c r="${addr}"${sAttr}/>`;
    });
    for (const [addr, value] of changes) {
      if (seen.has(addr)) continue;
      xml = setCellInSheetXml(xml, addr, value, parseInt(addr.match(/\d+/)[0], 10));
    }
    zip.file(path, xml);
  }

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

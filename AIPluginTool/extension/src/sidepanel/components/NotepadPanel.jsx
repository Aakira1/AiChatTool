import { useCallback, useEffect, useRef, useState } from "react";
import { getNotepad, saveNotepad, subscribeNotepad } from "../../lib/storage.js";
import { NOTE_TEMPLATES } from "../../lib/noteTemplates.js";
import { aiComplete } from "../../lib/api.js";
import { getActiveProvider, streamLlm } from "../../lib/aiProviders.js";
import { mdToHtml } from "../../lib/markdown.js";
import { downloadNoteFile, isNoteFile, parseNoteFile } from "../../lib/noteFile.js";

// AI actions available from the Notepad's ✨ AI menu. `mode` decides how the
// result is applied: replace the note, or append to it.
const AI_ACTIONS = [
  { id: "improve", icon: "✨", label: "Improve writing", mode: "replace",
    prompt: (t) => `Rewrite and improve the following note for clarity, grammar and a professional tone. Keep the meaning and any structure. Return ONLY the rewritten note in clean Markdown, with no preamble.\n\n---\n${t}` },
  { id: "grammar", icon: "✅", label: "Fix spelling & grammar", mode: "replace",
    prompt: (t) => `Correct spelling, grammar and punctuation in the following note. Do not change the meaning, tone or wording beyond necessary fixes. Return ONLY the corrected note in Markdown.\n\n---\n${t}` },
  { id: "shorter", icon: "✂️", label: "Make it shorter", mode: "replace",
    prompt: (t) => `Make the following note more concise while keeping all key points. Return ONLY the shortened note in Markdown.\n\n---\n${t}` },
  { id: "longer", icon: "➕", label: "Make it longer", mode: "replace",
    prompt: (t) => `Expand the following note with more useful detail and elaboration, staying strictly on topic. Return ONLY the expanded note in Markdown.\n\n---\n${t}` },
  { id: "summary", icon: "📝", label: "Summarise", mode: "append",
    prompt: (t) => `Summarise the following note as a short "## Summary" section with a few bullet points of the key items. Return ONLY the summary in Markdown.\n\n---\n${t}` },
  { id: "actions", icon: "☑️", label: "Extract action items", mode: "append",
    prompt: (t) => `From the following note, extract a concise "## Action Items" checklist using "- [ ] " items for each concrete task. Return ONLY that section in Markdown.\n\n---\n${t}` },
  { id: "continue", icon: "✍️", label: "Continue writing", mode: "append",
    prompt: (t) => `Continue writing the following note naturally from where it ends. Return ONLY the new continuation in Markdown — no preamble and do not repeat existing text.\n\n---\n${t}` },
];

// Actions offered by the inline (selection) assistant — the ones that make sense
// on a highlighted passage.
const SELECTION_ACTIONS = AI_ACTIONS.filter((a) => ["improve", "grammar", "shorter", "longer"].includes(a.id));

// NOTE: `xlsx` is heavy (~600 kB). It is dynamically imported only when a user
// actually imports a schedule, so it stays out of the main side-panel bundle.

const FONTS = ["Default", "Arial", "Georgia", "Courier New", "Times New Roman", "Trebuchet MS", "Verdana"];

const SHORTCODES = {
  // Date & time
  ts:       () => new Date().toLocaleString("en-AU"),
  now:      () => new Date().toLocaleString("en-AU"),
  date:     () => new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }),
  today:    () => new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
  time:     () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  week:     () => { const d = new Date(); return `Week ${Math.ceil(d.getDate() / 7)}, ${d.toLocaleString("en-AU", { month: "long", year: "numeric" })}`; },
  // Status tags
  status:   () => "[In Progress]",
  done:     () => "[Completed]",
  action:   () => "[Action Required]",
  followup: () => "[Follow-up]",
  blocker:  () => "[Blocker]",
  decision: () => "[Decision]",
  risk:     () => "[Risk]",
  // Priority
  high:     () => "[High Priority]",
  med:      () => "[Medium Priority]",
  low:      () => "[Low Priority]",
  // Quick markers
  todo:     () => "☐ ",
  check:    () => "☑ ",
  na:       () => "N/A",
  tbd:      () => "TBD",
  eta:      () => "ETA: ",
  arrow:    () => "→ ",
  // Blocks
  meeting:  () => `Meeting Notes — ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}`,
  sig:      () => "Signed: ____________________   Date: __________",
  hr:       () => "————————————————————",
};

const SHORTCODE_HELP = [
  { code: "ts",       label: "{ts}",       desc: "Date & time" },
  { code: "today",    label: "{today}",    desc: "Full date" },
  { code: "time",     label: "{time}",     desc: "Current time" },
  { code: "week",     label: "{week}",     desc: "Current week" },
  { code: "status",   label: "{status}",   desc: "[In Progress]" },
  { code: "done",     label: "{done}",     desc: "[Completed]" },
  { code: "action",   label: "{action}",   desc: "[Action Required]" },
  { code: "followup", label: "{followup}", desc: "[Follow-up]" },
  { code: "blocker",  label: "{blocker}",  desc: "[Blocker]" },
  { code: "decision", label: "{decision}", desc: "[Decision]" },
  { code: "risk",     label: "{risk}",     desc: "[Risk]" },
  { code: "high",     label: "{high}",     desc: "[High Priority]" },
  { code: "med",      label: "{med}",      desc: "[Medium Priority]" },
  { code: "low",      label: "{low}",      desc: "[Low Priority]" },
  { code: "todo",     label: "{todo}",     desc: "☐ checkbox" },
  { code: "check",    label: "{check}",    desc: "☑ ticked" },
  { code: "arrow",    label: "{arrow}",    desc: "→ arrow" },
  { code: "na",       label: "{na}",       desc: "N/A" },
  { code: "tbd",      label: "{tbd}",      desc: "TBD" },
  { code: "meeting",  label: "{meeting}",  desc: "Meeting heading" },
  { code: "sig",      label: "{sig}",      desc: "Signature line" },
  { code: "hr",       label: "{hr}",       desc: "Divider line" },
];

const OLD_NOTES_NAME = "Old Notes";
const NEW_NOTE_TITLE = "New Note";

const STORAGE_KEY = "cia-notepad-notes";   // legacy localStorage (migrated once)
const FOLDERS_KEY = "cia-notepad-folders"; // legacy localStorage (migrated once)

function defaultNotes() {
  return [{ id: "default", title: "Project Notes", content: "", updatedAt: null, fromSchedule: false, folderId: null }];
}

// One-time migration source: the old per-site localStorage store.
function loadLegacy() {
  try {
    const notes = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    const folders = JSON.parse(localStorage.getItem(FOLDERS_KEY) || "null");
    if (notes?.length) return { notes, folders: folders ?? [] };
  } catch { /* ignore */ }
  return null;
}

// Shared cell styling — kept in JS so dynamically-added rows/columns match the
// originals exactly. NOTE: cells are NOT individually contenteditable; the whole
// editor is the editable surface, which keeps the caret behaving (the old nested
// contenteditable cells broke cursor placement and cell growth).
const TABLE_CELL_CSS = "border:1px solid var(--cia-border);padding:6px 9px;min-width:40px;vertical-align:top;word-break:break-word;";
const TABLE_TH_CSS = TABLE_CELL_CSS + "background:var(--cia-soft);font-weight:600;text-align:left;";

function makeGrid(rows = 3, cols = 3) {
  const th = (i) => `<th style="${TABLE_TH_CSS}">Col ${i + 1}</th>`;
  const td = () => `<td style="${TABLE_CELL_CSS}"><br></td>`;
  const header = `<tr>${Array.from({ length: cols }, (_, i) => th(i)).join("")}</tr>`;
  const body = Array.from({ length: rows - 1 }, () => `<tr>${Array.from({ length: cols }, td).join("")}</tr>`).join("");
  // table-layout:fixed + width:100% → columns stay even and text wraps inside the
  // cell (so it grows vertically and the caret never escapes the cell).
  return `<table class="cia-ext-np-table" style="border-collapse:collapse;width:100%;table-layout:fixed;margin:8px 0;font-size:12px;"><tbody>${header}${body}</tbody></table><p><br></p>`;
}

function htmlToPlainText(html) {
  const div = document.createElement("div");
  div.innerHTML = html.replace(/<\/tr>/gi, "\n").replace(/<\/t[dh]>/gi, "\t");
  return (div.textContent || "").replace(/\t\n/g, "\n").trim();
}

function htmlToMarkdown(html) {
  return html
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "_$1_")
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "_$1_")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) => `- ${c.replace(/<[^>]+>/g, "").trim()}\n`)
    .replace(/<\/tr>/gi, "\n").replace(/<\/t[dh]>/gi, " | ")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n").trim();
}

const SCHEDULE_FOLDER_NAME = "Scheduled Projects";

// ── File export helpers ──────────────────────────────────────────────────────

function safeFileName(name) {
  return (name || "note").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "note";
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// The grid cells use CSS variables that only exist inside the extension. Resolve
// them to real colours so tables keep their borders in exported documents.
function resolveCssVars(html) {
  return String(html ?? "")
    .replace(/var\(--cia-border\)/g, "#c9b8e6")
    .replace(/var\(--cia-soft\)/g, "#f4eefb")
    .replace(/var\(--cia-purple\)/g, "#7c3aed")
    .replace(/var\(--cia-navy\)/g, "#2d1b69")
    .replace(/var\(--cia-body\)/g, "#1f1235");
}

// Shared professional document styling — clean header, branded rule, proper
// tables, lists and fonts. Used by PDF, HTML and Word exports.
function docStyles(font) {
  const ff = font && font !== "Default" ? `'${font}', Arial, sans-serif` : "Arial, Helvetica, sans-serif";
  return `
    :root{--cia-border:#c9b8e6;--cia-soft:#f4eefb;--cia-purple:#7c3aed;--cia-navy:#2d1b69;--cia-body:#1f1235;}
    *{box-sizing:border-box;}
    .doc-body{font-family:${ff};color:#1f1235;font-size:12px;line-height:1.55;}
    .doc-head{border-bottom:2px solid #7c3aed;padding-bottom:10px;margin-bottom:16px;}
    .doc-title{font-size:20px;font-weight:700;color:#2d1b69;margin:0;}
    .doc-sub{font-size:11px;color:#6b6285;margin:4px 0 0;}
    .doc-body h1,.doc-body h2,.doc-body h3,.doc-body h4{color:#2d1b69;margin:14px 0 6px;}
    .doc-body table{border-collapse:collapse;width:100%;margin:10px 0;}
    .doc-body td,.doc-body th{border:1px solid #c9b8e6;padding:6px 9px;font-size:11px;vertical-align:top;}
    .doc-body th{background:#f4eefb;font-weight:700;text-align:left;}
    .doc-body ul,.doc-body ol{margin:6px 0 6px 20px;}
    .doc-body li{margin:2px 0;}
    .doc-body p{margin:6px 0;}
  `;
}
function professionalBody(title, innerHtml, font) {
  const dateStr = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  return `<style>${docStyles(font)}</style><div class="doc-body">
    <div class="doc-head"><p class="doc-title">${escapeHtml(title)}</p>
    <p class="doc-sub">OneChat · Project Notes — ${dateStr}</p></div>
    ${resolveCssVars(innerHtml) || "<p><em>(empty note)</em></p>"}
  </div>`;
}
function reportHtmlDoc(title, innerHtml, font) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>` +
    `<body style="max-width:820px;margin:40px auto;padding:0 24px;">${professionalBody(title, innerHtml, font)}</body></html>`;
}

// A real Word .docx file (lazy-loaded) — keeps headings, tables, lists, fonts.
async function noteDocxBlob(title, innerHtml, font) {
  const { asBlob } = await import("html-docx-js-typescript");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${professionalBody(title, innerHtml, font)}</body></html>`;
  const out = await asBlob(html);
  return out instanceof Blob
    ? out
    : new Blob([out], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

// Rich PDF via jsPDF's HTML renderer — renders the note exactly as a document,
// preserving grids, fonts, bold/italic, lists and headings.
async function notePdfBlob(title, innerHtml, font) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });

  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-10000px;top:0;width:760px;background:#fff;";
  holder.innerHTML = professionalBody(title, innerHtml, font);
  document.body.appendChild(holder);
  try {
    await new Promise((resolve, reject) => {
      doc.html(holder, {
        x: 0,
        y: 0,
        margin: [36, 36, 48, 36],
        width: 523,        // A4 content width in pt (595 − 2×36)
        windowWidth: 760,  // must match holder px width
        autoPaging: "text",
        callback: () => resolve(),
      }).catch?.(reject);
    });
  } finally {
    holder.remove();
  }
  return doc.output("blob");
}

// ── Schedule parsing ────────────────────────────────────────────────────────

function parseBookingsSheet(workbook, XLSX) {
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (rows.length < 2) return [];

  // The export can have one or more blank leading rows before the header row,
  // so find the real header row (the first row that contains "Project").
  let headerRow = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = rows[i].map((c) => String(c ?? "").trim().toLowerCase());
    if (cells.includes("project") || cells.includes("project code")) {
      headerRow = i;
      break;
    }
  }

  const headers = rows[headerRow].map((h) => String(h ?? "").trim());

  // Find date columns (header contains a date pattern like "Mon 15-Jun")
  const dateColIndices = [];
  const dateLabels = [];
  headers.forEach((h, i) => {
    if (/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}-[A-Za-z]{3}/.test(h)) {
      dateColIndices.push(i);
      dateLabels.push(h);
    }
  });

  // The project NAME lives in the second column (index 1). Fall back to a header
  // match if the layout ever changes.
  const projectCol  = headers.indexOf("Project") !== -1 ? headers.indexOf("Project") : 1;
  const codeCol     = headers.indexOf("Project Code") !== -1 ? headers.indexOf("Project Code") : 0;
  const pmCol       = headers.indexOf("Project Manager");
  const taskCol     = headers.indexOf("Task");
  const statusCol   = headers.indexOf("Booking Status");

  const councils = {};

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const project = String(row[projectCol] ?? "").trim();
    // Import every real project row; skip blanks and "unbooked days" filler.
    if (!project || project.toLowerCase() === "unbooked days") continue;

    const code   = String(row[codeCol] ?? "").trim();
    const pm     = String(row[pmCol] ?? "").trim();
    const task   = String(row[taskCol] ?? "").trim();
    const status = String(row[statusCol] ?? "").trim();

    const bookedDates = [];
    dateColIndices.forEach((ci, idx) => {
      const val = row[ci];
      if (val === 1 || val === "1") bookedDates.push(dateLabels[idx]);
    });

    const key = code || project;
    if (!councils[key]) {
      councils[key] = { code, project, pm, tasks: [], bookedDates: [] };
    }
    if (task) councils[key].tasks.push({ task, status, bookedDates });
    bookedDates.forEach((d) => { if (!councils[key].bookedDates.includes(d)) councils[key].bookedDates.push(d); });
  }

  return Object.values(councils);
}

function buildCouncilContent(council) {
  const { code, project, pm, tasks, bookedDates } = council;

  const dateRows = bookedDates
    .map((d) => `<tr><td style="border:1px solid var(--cia-border);padding:4px 8px;">${d}</td><td style="border:1px solid var(--cia-border);padding:4px 8px;"></td></tr>`)
    .join("");

  const taskRows = tasks
    .map((t) => `<li><strong>${t.task}</strong> <em>(${t.status})</em> — ${t.bookedDates.join(", ") || "no dates"}</li>`)
    .join("");

  return `<h3>📋 ${project}</h3>
<p><strong>Project Code:</strong> ${code} &nbsp;|&nbsp; <strong>Project Manager:</strong> ${pm}</p>

<h4>Scheduled Tasks</h4>
<ul>${taskRows || "<li>No tasks listed</li>"}</ul>

<h4>Booked Dates</h4>
<table style="border-collapse:collapse;width:100%;font-size:12px;margin-bottom:12px;">
  <thead><tr>
    <th style="border:1px solid var(--cia-border);padding:4px 8px;background:var(--cia-soft);">Date</th>
    <th style="border:1px solid var(--cia-border);padding:4px 8px;background:var(--cia-soft);">Work completed / Notes</th>
  </tr></thead>
  <tbody>${dateRows}</tbody>
</table>

<h4>Work Log</h4>
<p><em>Add notes, actions and updates below…</em></p>
<p><br></p>`;
}

// ── Subcomponents ───────────────────────────────────────────────────────────

function NoteTitle({ note, onRename }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note.title);
  useEffect(() => setValue(note.title), [note.title]);
  if (editing) {
    return (
      <input
        className="cia-ext-notepad-title-input"
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { onRename(value || "Untitled"); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditing(false); }}
      />
    );
  }
  return (
    <span className="cia-ext-notepad-title" onDoubleClick={() => setEditing(true)} title="Double-click to rename">
      {note.fromSchedule ? "🏛 " : ""}{note.title}
    </span>
  );
}

function FolderChip({ folder, count, isDrop, onToggle, onRename, onDelete, onDragOver, onDrop }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(folder.name);
  useEffect(() => setValue(folder.name), [folder.name]);

  return (
    <div
      className={`cia-ext-notepad-folder${isDrop ? " is-drop" : ""}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
      title="Drag a tab here to file it. Click to expand/collapse."
    >
      <button className="cia-ext-notepad-folder-toggle" onClick={onToggle}>
        {folder.collapsed ? "▸" : "▾"} 📁
      </button>
      {editing ? (
        <input
          className="cia-ext-notepad-folder-input"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => { onRename(value); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditing(false); }}
        />
      ) : (
        <span className="cia-ext-notepad-folder-name" onDoubleClick={() => setEditing(true)} title={`${folder.name} — double-click to rename`}>
          {folder.name}
        </span>
      )}
      <span className="cia-ext-notepad-folder-count">{count}</span>
      <button className="cia-ext-notepad-folder-del" onClick={onDelete} title="Delete folder (keeps notes)">×</button>
    </div>
  );
}

function ScheduleUploader({ onScheduleLoaded }) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const processFile = (file) => {
    if (!file) return;
    if (!/\.(xlsx|xls|xlsm)$/i.test(file.name)) {
      setError("Please upload an Excel file (.xlsx, .xls)");
      return;
    }
    setLoading(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import("xlsx"); // loaded on demand
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const councils = parseBookingsSheet(wb, XLSX);
        if (councils.length === 0) {
          setError("No projects with bookings found in this schedule.");
        } else {
          onScheduleLoaded(councils);
        }
      } catch (err) {
        setError(`Failed to parse file: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="cia-ext-notepad-upload-section">
      <div className="cia-ext-notepad-upload-label">
        📅 Import a schedule
        <span className="cia-ext-notepad-upload-hint">Projects auto-create tabs</span>
      </div>
      <div
        className={`cia-ext-notepad-dropzone${dragging ? " is-dragging" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); }}
      >
        {loading ? "Parsing…" : "Drop .xlsx here or click to browse"}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.xlsm"
          style={{ display: "none" }}
          onChange={(e) => processFile(e.target.files[0])}
        />
      </div>
      {error ? <p className="cia-ext-notepad-upload-error">{error}</p> : null}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function NotepadPanel({ onClose, onGenerate }) {
  const [notes, setNotes] = useState(defaultNotes);
  const [folders, setFolders] = useState([]);
  const [activeId, setActiveId] = useState("default");
  const [saved, setSaved] = useState(false);
  const [showShortcodes, setShowShortcodes] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [font, setFont] = useState("Default");
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [inTable, setInTable] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPreview, setAiPreview] = useState("");
  const [aiLabel, setAiLabel] = useState("");
  const [aiError, setAiError] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const [askText, setAskText] = useState("");
  const [fileDrag, setFileDrag] = useState(false);
  const aiAbortRef = useRef(null);
  // Inline (selection) assistant
  const [selTool, setSelTool] = useState(null); // { x, y } of the floating icon
  const [inlineMenuOpen, setInlineMenuOpen] = useState(false);
  const [inlineResult, setInlineResult] = useState(null); // { label, text, busy, x, y }
  const selRangeRef = useRef(null);
  const inlineAbortRef = useRef(null);
  const [zipping, setZipping] = useState(false);
  const [dragId, setDragId] = useState(null);       // note id being dragged
  const [dropTarget, setDropTarget] = useState(null); // "folder:<id>" | "ungrouped" | "note:<id>"
  const [editingTabId, setEditingTabId] = useState(null); // note tab being renamed inline
  const [editTabValue, setEditTabValue] = useState("");
  const [hydrated, setHydrated] = useState(false);    // shared store loaded
  const editorRef = useRef(null);
  const saveTimerRef = useRef(null);
  const currentCellRef = useRef(null); // table cell the caret is in (for table tools)

  // Keep latest notes/folders in refs so persist can always write BOTH halves
  // (chrome.storage stores them together under one "notes" key).
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const lastWriteRef = useRef(""); // JSON of our most recent write (to ignore its echo)

  // Persist notes + folders TOGETHER (chrome.storage stores them under one key).
  const writeStore = useCallback((nextNotes, nextFolders) => {
    const payload = { notes: nextNotes, folders: nextFolders };
    lastWriteRef.current = JSON.stringify(payload);
    void saveNotepad(payload);
  }, []);
  // Convenience writers that always pair the other half from the latest refs.
  const persistNotes = useCallback((n) => writeStore(n, foldersRef.current), [writeStore]);
  const persistFolders = useCallback((f) => writeStore(notesRef.current, f), [writeStore]);

  const activeNote = notes.find((n) => n.id === activeId) ?? notes[0];

  // Load the shared store on mount, migrating legacy localStorage once. Then
  // live-sync whenever another screen of the plugin changes the notes.
  useEffect(() => {
    let active = true;
    (async () => {
      let data = await getNotepad();
      if (!data?.notes?.length) {
        const legacy = loadLegacy();
        if (legacy) {
          data = legacy;
          void saveNotepad(legacy); // migrate into the shared store
        }
      }
      if (active && data?.notes?.length) {
        setNotes(data.notes);
        setFolders(data.folders ?? []);
        setActiveId((cur) => (data.notes.some((n) => n.id === cur) ? cur : data.notes[0].id));
      }
      if (active) setHydrated(true);
    })();

    const unsub = subscribeNotepad((val) => {
      if (!val?.notes) return;
      // Ignore the echo from our own writes; adopt changes made on other screens.
      if (JSON.stringify(val) === lastWriteRef.current) return;
      setNotes(val.notes);
      setFolders(val.folders ?? []);
    });
    return () => { active = false; unsub(); };
  }, []);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = activeNote?.content ?? "";
  }, [activeId, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editorRef.current) editorRef.current.style.fontFamily = font === "Default" ? "" : font;
  }, [font]);

  const saveNote = useCallback((overrideId) => {
    if (!editorRef.current) return;
    const id = overrideId ?? activeId;
    const content = editorRef.current.innerHTML;
    setNotes((prev) => {
      const updated = prev.map((n) => n.id === id ? { ...n, content, updatedAt: new Date().toISOString() } : n);
      persistNotes(updated);
      return updated;
    });
    setSaved(true);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaved(false), 2000);
  }, [activeId]);

  const handleInput = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveNote(), 1500);
  }, [saveNote]);

  const handleKeyUp = useCallback((e) => {
    // Keep the table-tools toolbar in sync as the caret moves with the keyboard.
    trackCell();
    // Markdown-style list shortcuts: "- " / "* " → bullet list, "1. " → numbered.
    if (e.key === " ") {
      const sel0 = window.getSelection();
      if (sel0?.rangeCount) {
        const range0 = sel0.getRangeAt(0);
        const node0 = range0.startContainer;
        if (node0.nodeType === Node.TEXT_NODE) {
          const before0 = node0.textContent.slice(0, range0.startOffset);
          const bullet = /^\s*[-*]\s$/.test(before0);
          const ordered = /^\s*\d+\.\s$/.test(before0);
          if (bullet || ordered) {
            // Strip the marker text, then turn the line into a list.
            node0.textContent = node0.textContent.slice(range0.startOffset);
            const r = document.createRange();
            r.setStart(node0, 0);
            r.setEnd(node0, 0);
            sel0.removeAllRanges();
            sel0.addRange(r);
            editorRef.current?.focus();
            document.execCommand(bullet ? "insertUnorderedList" : "insertOrderedList", false, null);
            saveNote();
            return;
          }
        }
      }
    }

    // Expand the moment the closing brace is typed, or on a following separator.
    if (e.key !== "}" && e.key !== " " && e.key !== "Enter" && e.key !== "Tab") return;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent;
    // Match {code} optionally followed by a single trailing space/tab.
    const match = text.slice(0, range.startOffset).match(/\{(\w+)\}([ \t]?)$/);
    if (!match) return;
    const fn = SHORTCODES[match[1].toLowerCase()];
    if (!fn) return;
    const token = `{${match[1]}}`;
    const start = range.startOffset - match[0].length;
    const before = text.slice(0, start);
    const after = text.slice(start + token.length + match[2].length);
    const expanded = fn();
    node.textContent = before + expanded + (match[2] || "") + after;
    const newPos = before.length + expanded.length + (match[2] ? 1 : 0);
    range.setStart(node, newPos); range.setEnd(node, newPos);
    sel.removeAllRanges(); sel.addRange(range);
    saveNote();
  }, [saveNote]);

  const exec = (cmd) => { editorRef.current?.focus(); document.execCommand(cmd, false, null); };
  const insertHtml = (html) => { editorRef.current?.focus(); document.execCommand("insertHTML", false, html); };

  // Create a list and set its marker style (bullet shape / numbering scheme).
  const insertList = (type) => {
    const ordered = ["decimal", "lower-alpha", "lower-roman", "upper-alpha"].includes(type);
    editorRef.current?.focus();
    document.execCommand(ordered ? "insertOrderedList" : "insertUnorderedList", false, null);
    let node = window.getSelection()?.anchorNode;
    while (node && node !== editorRef.current) {
      if (node.nodeName === "UL" || node.nodeName === "OL") {
        node.style.listStyleType = type;
        break;
      }
      node = node.parentNode;
    }
    setListMenuOpen(false);
    saveNote();
  };

  // ── Word-style table editing ───────────────────────────────────────────────
  // The whole editor is contenteditable; we manipulate the table DOM directly
  // and keep a reference to the cell the caret is in so the toolbar buttons work
  // even after focus moves to a button.
  const findCell = (node) => {
    let n = node;
    while (n && n !== editorRef.current) {
      if (n.nodeType === 1 && (n.tagName === "TD" || n.tagName === "TH")) return n;
      n = n.parentNode;
    }
    return null;
  };

  const trackCell = () => {
    const sel = window.getSelection();
    const cell = sel?.rangeCount ? findCell(sel.getRangeAt(0).startContainer) : null;
    currentCellRef.current = cell;
    setInTable(Boolean(cell));
  };

  const colIndexOf = (cell) => Array.from(cell.parentNode.children).indexOf(cell);

  const newCell = (tag) => {
    const c = document.createElement(tag === "th" ? "th" : "td");
    c.style.cssText = tag === "th" ? TABLE_TH_CSS : TABLE_CELL_CSS;
    c.innerHTML = "<br>";
    return c;
  };

  const placeCaret = (cell) => {
    if (!cell) return;
    editorRef.current?.focus();
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    currentCellRef.current = cell;
    setInTable(true);
  };

  const insertTableRow = (where) => {
    const cell = currentCellRef.current;
    if (!cell) return;
    const row = cell.parentNode;
    const table = cell.closest("table");
    const cols = Math.max(...Array.from(table.rows, (r) => r.cells.length));
    const tr = document.createElement("tr");
    for (let i = 0; i < cols; i += 1) tr.appendChild(newCell("td"));
    row.parentNode.insertBefore(tr, where === "above" ? row : row.nextSibling);
    placeCaret(tr.cells[Math.min(colIndexOf(cell), tr.cells.length - 1)]);
    saveNote();
  };

  const insertTableCol = (where) => {
    const cell = currentCellRef.current;
    if (!cell) return;
    const idx = colIndexOf(cell);
    const table = cell.closest("table");
    for (const r of table.rows) {
      const ref = r.cells[idx];
      const tag = ref?.tagName === "TH" ? "th" : "td";
      r.insertBefore(newCell(tag), where === "left" ? ref : (ref?.nextSibling ?? null));
    }
    placeCaret(cell.parentNode.cells[where === "left" ? idx : idx + 1]);
    saveNote();
  };

  const deleteTableRow = () => {
    const cell = currentCellRef.current;
    if (!cell) return;
    const table = cell.closest("table");
    if (table.rows.length <= 1) table.remove();
    else cell.parentNode.remove();
    currentCellRef.current = null;
    setInTable(false);
    saveNote();
  };

  const deleteTableCol = () => {
    const cell = currentCellRef.current;
    if (!cell) return;
    const idx = colIndexOf(cell);
    const table = cell.closest("table");
    if (table.rows[0].cells.length <= 1) table.remove();
    else for (const r of table.rows) r.cells[idx]?.remove();
    currentCellRef.current = null;
    setInTable(false);
    saveNote();
  };

  const deleteTable = () => {
    currentCellRef.current?.closest("table")?.remove();
    currentCellRef.current = null;
    setInTable(false);
    saveNote();
  };

  const insertTable = (rows = 3, cols = 3) => {
    insertHtml(makeGrid(rows, cols));
    // Drop the caret into the first body cell so typing starts inside the table.
    setTimeout(() => {
      const tables = editorRef.current?.querySelectorAll("table.cia-ext-np-table");
      const first = tables?.[tables.length - 1]?.querySelector("tbody tr:nth-child(2) td, td");
      if (first) placeCaret(first);
      saveNote();
    }, 0);
  };

  // Tab / Shift+Tab moves between cells (Word-style); Tab past the last cell adds
  // a new row.
  const handleEditorKeyDown = (e) => {
    if (e.key !== "Tab") return;
    const sel = window.getSelection();
    const cell = sel?.rangeCount ? findCell(sel.getRangeAt(0).startContainer) : null;
    if (!cell) return;
    e.preventDefault();
    const table = cell.closest("table");
    const all = Array.from(table.querySelectorAll("td,th"));
    const i = all.indexOf(cell);
    if (e.shiftKey) {
      if (i > 0) placeCaret(all[i - 1]);
    } else if (i < all.length - 1) {
      placeCaret(all[i + 1]);
    } else {
      currentCellRef.current = cell;
      insertTableRow("below");
      const row = currentCellRef.current?.parentNode;
      if (row?.cells?.length) placeCaret(row.cells[0]);
    }
  };

  // Template generator — drop a ready-made layout into the editor. When the note
  // is still empty we replace its content (and adopt the template's name);
  // otherwise the template is inserted at the cursor so existing notes are kept.
  const insertTemplate = (tpl) => {
    setTemplateMenuOpen(false);
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const html = tpl.html();
    const isEmpty = !htmlToPlainText(editor.innerHTML).trim();
    if (isEmpty) {
      editor.innerHTML = html;
      const defaultTitle = !activeNote.fromSchedule &&
        (activeNote.title === NEW_NOTE_TITLE || activeNote.title === "Project Notes");
      if (defaultTitle) renameNoteById(activeNote.id, tpl.label);
    } else {
      document.execCommand("insertHTML", false, html);
    }
    saveNote();
  };

  // ── AI tooling ─────────────────────────────────────────────────────────────
  const applyAiResult = (mode, full) => {
    const editor = editorRef.current;
    if (!editor) return;
    const html = mdToHtml(full);
    if (mode === "replace") {
      editor.innerHTML = html;
    } else {
      const cur = editor.innerHTML.replace(/(?:<p><br\s*\/?><\/p>\s*)+$/i, "");
      editor.innerHTML = `${cur}<p><br></p>${html}`;
    }
    saveNote();
  };

  const runAi = async (action, customMessage) => {
    if (aiBusy) return;
    const text = htmlToPlainText(editorRef.current?.innerHTML ?? "");
    if (!customMessage && !text.trim()) {
      setAiError("Write some notes first, then run an AI action.");
      return;
    }
    // Writing-copilot persona — tailors the assistant to editing/grammar work and
    // gives it a Copilot-like "helpful in-document editor" tone.
    const persona =
      "You are a writing copilot embedded in a note-taking editor. Act like an expert editor: improve clarity, grammar, spelling, punctuation, tone and structure while preserving the author's meaning and voice. Reply with ONLY the requested result in clean Markdown — no preamble, no commentary, no explanations.";
    const user = customMessage
      ? `${customMessage}\n\nUse the note below as context if relevant.\n\n---\n${text}`
      : action.prompt(text);
    setAiMenuOpen(false);
    setAskOpen(false);
    setAiError("");
    setAiBusy(true);
    setAiPreview("");
    setAiLabel(action?.label || "Copilot");
    const controller = new AbortController();
    aiAbortRef.current = controller;
    const onToken = (t) => setAiPreview((p) => p + t);
    try {
      // Use the user's configured AI provider if set; otherwise the built-in model.
      const provider = await getActiveProvider();
      const full = provider
        ? await streamLlm({
            provider,
            messages: [{ role: "system", content: persona }, { role: "user", content: user }],
            signal: controller.signal,
            onToken,
          })
        : await aiComplete({ message: `${persona}\n\n${user}`, signal: controller.signal, onToken });
      if (full.trim()) applyAiResult(action?.mode || "append", full.trim());
    } catch (e) {
      if (e.name !== "AbortError") setAiError(e.message || "AI request failed");
    } finally {
      setAiBusy(false);
      setAiPreview("");
      aiAbortRef.current = null;
    }
  };

  const cancelAi = () => aiAbortRef.current?.abort();

  // ── Inline selection assistant ──────────────────────────────────────────────
  // Show a floating ✨ icon whenever text is selected in the editor.
  const updateSelectionTool = () => {
    if (inlineResult) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !sel.toString().trim()) {
      setSelTool(null);
      setInlineMenuOpen(false);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!editorRef.current || !editorRef.current.contains(range.commonAncestorContainer)) {
      setSelTool(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    selRangeRef.current = range.cloneRange();
    setSelTool({ x: rect.left + rect.width / 2, y: rect.top });
  };

  const runInlineAi = async (action) => {
    const range = selRangeRef.current;
    if (!range) return;
    const text = range.toString().trim();
    if (!text) return;
    setInlineMenuOpen(false);
    setSelTool(null);
    const rect = range.getBoundingClientRect();
    setInlineResult({ label: action.label, text: "", busy: true, x: rect.left, y: rect.bottom });
    const controller = new AbortController();
    inlineAbortRef.current = controller;
    const persona =
      "You are a writing assistant editing a selected passage of a note. Return ONLY the revised passage as plain text — no markdown headings, no surrounding quotes, no commentary.";
    const user = action.prompt(text);
    const onToken = (t) => setInlineResult((r) => (r ? { ...r, text: r.text + t } : r));
    try {
      const provider = await getActiveProvider();
      const full = provider
        ? await streamLlm({ provider, messages: [{ role: "system", content: persona }, { role: "user", content: user }], signal: controller.signal, onToken })
        : await aiComplete({ message: `${persona}\n\n${user}`, signal: controller.signal, onToken });
      setInlineResult((r) => (r ? { ...r, text: full.trim(), busy: false } : r));
    } catch (e) {
      if (e.name !== "AbortError") setInlineResult((r) => (r ? { ...r, text: `⚠️ ${e.message}`, busy: false } : r));
    }
  };

  // Replace the user's selection with the AI's version.
  const acceptInline = () => {
    const range = selRangeRef.current;
    const result = inlineResult;
    if (!range || !result?.text) return;
    editorRef.current?.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("insertText", false, result.text);
    saveNote();
    setInlineResult(null);
    selRangeRef.current = null;
  };

  // Keep the user's own text.
  const discardInline = () => {
    inlineAbortRef.current?.abort();
    setInlineResult(null);
  };

  // ── Note files: import via drag & drop, export to disk ──────────────────────
  const importNoteFiles = async (fileList) => {
    const files = [...(fileList ?? [])].filter((f) => isNoteFile(f.name));
    if (!files.length) return;
    // Capture the active editor's latest content before adding notes.
    const liveContent = editorRef.current?.innerHTML;
    let nextNotes = notesRef.current.map((n) =>
      n.id === activeId && liveContent != null ? { ...n, content: liveContent, updatedAt: new Date().toISOString() } : n,
    );
    let firstId = null;
    for (const f of files) {
      const { title, content } = parseNoteFile(f.name, await f.text());
      const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      nextNotes = [...nextNotes, { id, title, content, updatedAt: new Date().toISOString(), fromSchedule: false, folderId: null }];
      if (!firstId) firstId = id;
    }
    setNotes(nextNotes);
    if (firstId) setActiveId(firstId);
    writeStore(nextNotes, foldersRef.current);
  };

  const saveNoteToFile = () => {
    closeFileMenu();
    downloadNoteFile(activeNote.title, editorRef.current?.innerHTML ?? activeNote.content ?? "");
  };

  const switchNote = (id) => { saveNote(activeId); setActiveId(id); };

  const addNote = () => {
    const id = `note-${Date.now()}`;
    // Capture the active editor's latest content before switching notes.
    const liveContent = editorRef.current?.innerHTML;
    let nextNotes = notesRef.current.map((n) =>
      n.id === activeId && liveContent != null
        ? { ...n, content: liveContent, updatedAt: new Date().toISOString() }
        : n,
    );

    // Once untitled "New Note" tabs exceed 4 (or after we've consolidated once),
    // keep only the single newest one outside and tuck the rest into "Old Notes".
    const ungroupedNew = nextNotes.filter((n) => !n.folderId && !n.fromSchedule && n.title === NEW_NOTE_TITLE);
    const existingFolder = foldersRef.current.find((f) => f.name === OLD_NOTES_NAME);
    const consolidate = Boolean(existingFolder) || ungroupedNew.length + 1 > 4;
    const folderId = existingFolder?.id ?? `folder-old-${Date.now()}`;
    const nextFolders = consolidate && !existingFolder
      ? [...foldersRef.current, { id: folderId, name: OLD_NOTES_NAME, collapsed: true }]
      : foldersRef.current;

    nextNotes = [...nextNotes, { id, title: NEW_NOTE_TITLE, content: "", updatedAt: null, fromSchedule: false, folderId: null }];
    if (consolidate) {
      nextNotes = nextNotes.map((n) =>
        !n.folderId && !n.fromSchedule && n.title === NEW_NOTE_TITLE && n.id !== id
          ? { ...n, folderId }
          : n,
      );
    }

    setFolders(nextFolders);
    setNotes(nextNotes);
    setActiveId(id);
    writeStore(nextNotes, nextFolders);
  };

  const deleteNoteById = (deleteId) => {
    if (notes.length <= 1) return;
    setNotes((prev) => {
      const updated = prev.filter((n) => n.id !== deleteId);
      persistNotes(updated);
      if (deleteId === activeId) setActiveId(updated[0].id);
      return updated;
    });
  };

  const renameNote = (title) => renameNoteById(activeId, title);

  const renameNoteById = (id, title) => {
    setNotes((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, title: title || "Untitled" } : n));
      persistNotes(updated);
      return updated;
    });
  };

  // ── Folders ───────────────────────────────────────────────────────────────
  const addFolder = () => {
    const id = `folder-${Date.now()}`;
    setFolders((prev) => {
      const updated = [...prev, { id, name: "New Folder", collapsed: false }];
      persistFolders(updated);
      return updated;
    });
  };

  const toggleFolder = (id) => {
    setFolders((prev) => {
      const updated = prev.map((f) => f.id === id ? { ...f, collapsed: !f.collapsed } : f);
      persistFolders(updated);
      return updated;
    });
  };

  const renameFolder = (id, name) => {
    setFolders((prev) => {
      const updated = prev.map((f) => f.id === id ? { ...f, name: name || "Folder" } : f);
      persistFolders(updated);
      return updated;
    });
  };

  const deleteFolder = (id) => {
    // Move its notes back to ungrouped and drop the folder — in one atomic write.
    const nextNotes = notesRef.current.map((n) => (n.folderId === id ? { ...n, folderId: null } : n));
    const nextFolders = foldersRef.current.filter((f) => f.id !== id);
    setNotes(nextNotes);
    setFolders(nextFolders);
    writeStore(nextNotes, nextFolders);
  };

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const assignFolder = (noteId, folderId) => {
    setNotes((prev) => {
      const updated = prev.map((n) => n.id === noteId ? { ...n, folderId } : n);
      persistNotes(updated);
      return updated;
    });
  };

  const reorderNote = (draggedId, targetId) => {
    setNotes((prev) => {
      const from = prev.findIndex((n) => n.id === draggedId);
      const to = prev.findIndex((n) => n.id === targetId);
      if (from === -1 || to === -1 || from === to) return prev;
      const updated = [...prev];
      const [moved] = updated.splice(from, 1);
      // Dropping onto a note also adopts that note's folder.
      moved.folderId = prev[to].folderId ?? null;
      updated.splice(to, 0, moved);
      persistNotes(updated);
      return updated;
    });
  };

  const handleDrop = (target) => {
    if (!dragId) return;
    if (target.startsWith("folder:")) assignFolder(dragId, target.slice(7));
    else if (target === "ungrouped") assignFolder(dragId, null);
    else if (target.startsWith("note:")) reorderNote(dragId, target.slice(5));
    setDragId(null);
    setDropTarget(null);
  };

  // Called when schedule is uploaded — create one tab per project inside a
  // dedicated "Scheduled Projects" folder; skip any that already exist.
  // Notes + folder are computed together and written in ONE atomic store update
  // so the new folder and its notes can never be persisted out of sync.
  const handleScheduleLoaded = (councils) => {
    setShowUpload(false);

    // Start from the live notes, capturing the active editor's latest content.
    const liveContent = editorRef.current?.innerHTML;
    let nextNotes = notesRef.current.map((n) =>
      n.id === activeId && liveContent != null
        ? { ...n, content: liveContent, updatedAt: new Date().toISOString() }
        : n,
    );

    // Ensure the "Scheduled Projects" folder exists.
    const existingFolder = foldersRef.current.find((f) => f.name === SCHEDULE_FOLDER_NAME);
    const folderId = existingFolder?.id ?? `folder-sched-${Date.now()}`;
    const nextFolders = existingFolder
      ? foldersRef.current
      : [...foldersRef.current, { id: folderId, name: SCHEDULE_FOLDER_NAME, collapsed: false }];

    let firstNewId = null;
    councils.forEach((c) => {
      const existingId = `schedule-${c.code}`;
      if (!nextNotes.some((n) => n.id === existingId)) {
        nextNotes = [
          ...nextNotes,
          {
            id: existingId,
            title: shortProjectName(c.project),
            content: buildCouncilContent(c),
            updatedAt: new Date().toISOString(),
            fromSchedule: true,
            scheduleCode: c.code,
            folderId,
          },
        ];
        if (!firstNewId) firstNewId = existingId;
      }
    });

    setFolders(nextFolders);
    setNotes(nextNotes);
    if (firstNewId) setActiveId(firstNewId);
    writeStore(nextNotes, nextFolders); // single atomic persist
  };

  const closeFileMenu = () => setFileMenuOpen(false);

  const downloadAs = async (format) => {
    const html = editorRef.current?.innerHTML ?? "";
    const base = safeFileName(activeNote.title);
    closeFileMenu();
    if (format === "txt") {
      triggerDownload(new Blob([htmlToPlainText(html)], { type: "text/plain" }), `${base}.txt`);
    } else if (format === "md") {
      triggerDownload(new Blob([htmlToMarkdown(html)], { type: "text/markdown" }), `${base}.md`);
    } else if (format === "docx") {
      triggerDownload(await noteDocxBlob(activeNote.title, html, font), `${base}.docx`);
    } else {
      triggerDownload(new Blob([reportHtmlDoc(activeNote.title, html, font)], { type: "text/html" }), `${base}.html`);
    }
  };

  const summaryReportPdf = async () => {
    closeFileMenu();
    const html = editorRef.current?.innerHTML ?? "";
    const blob = await notePdfBlob(activeNote.title, html, font);
    triggerDownload(blob, `${safeFileName(activeNote.title)}-report.pdf`);
  };

  // Bundle every note into a ZIP — each as a PDF report + a Word (.doc) file,
  // organised by folder. Heavy libs are lazy-loaded only when this runs.
  const downloadAllZip = async () => {
    saveNote(activeId);
    closeFileMenu();
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const folderName = (id) => folders.find((f) => f.id === id)?.name;
      // Read the latest content for the active note straight from the editor.
      const liveNotes = notes.map((n) =>
        n.id === activeId ? { ...n, content: editorRef.current?.innerHTML ?? n.content } : n,
      );
      for (const n of liveNotes) {
        const dir = n.folderId ? `${safeFileName(folderName(n.folderId))}/` : "";
        const base = `${dir}${safeFileName(n.title)}`;
        zip.file(`${base}.docx`, await noteDocxBlob(n.title, n.content || "", font));
        zip.file(`${base}-report.pdf`, await notePdfBlob(n.title, n.content || "", font));
      }
      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, "OneChat-notes.zip");
    } finally {
      setZipping(false);
    }
  };

  const generateReport = () => {
    saveNote();
    const html = editorRef.current?.innerHTML ?? "";
    const text = htmlToPlainText(html);
    if (!text.trim()) return;
    onGenerate?.(text, activeNote.title);
    onClose();
  };

  // Draggable tab renderer — used for both ungrouped notes and notes inside folders.
  // Each tab carries its own × delete button.
  const renderTab = (n) => (
    <div
      key={n.id}
      draggable
      onDragStart={() => setDragId(n.id)}
      onDragEnd={() => { setDragId(null); setDropTarget(null); }}
      onDragOver={(e) => { e.preventDefault(); setDropTarget(`note:${n.id}`); }}
      onDrop={(e) => { e.stopPropagation(); handleDrop(`note:${n.id}`); }}
      className={[
        "cia-ext-notepad-tab",
        n.fromSchedule ? "is-council" : "",
        n.id === activeId ? "is-active" : "",
        dragId === n.id ? "is-dragging" : "",
        dropTarget === `note:${n.id}` ? "is-drop" : "",
      ].filter(Boolean).join(" ")}
      onClick={() => { if (editingTabId !== n.id) switchNote(n.id); }}
      role="button"
      tabIndex={0}
    >
      {editingTabId === n.id ? (
        <input
          className="cia-ext-notepad-tab-input"
          value={editTabValue}
          autoFocus
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setEditTabValue(e.target.value)}
          onBlur={() => { renameNoteById(n.id, editTabValue.trim()); setEditingTabId(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.target.blur();
            if (e.key === "Escape") setEditingTabId(null);
          }}
        />
      ) : (
        <span
          className="cia-ext-notepad-tab-label"
          title="Double-click to rename"
          onDoubleClick={(e) => { e.stopPropagation(); setEditingTabId(n.id); setEditTabValue(n.title); }}
        >
          {n.fromSchedule ? "🏛 " : ""}{n.title}
        </span>
      )}
      {notes.length > 1 ? (
        <button
          type="button"
          className="cia-ext-notepad-tab-del"
          title="Delete this note"
          onClick={(e) => { e.stopPropagation(); deleteNoteById(n.id); }}
        >
          ×
        </button>
      ) : null}
    </div>
  );

  const ungroupedNotes = notes.filter((n) => !n.folderId || !folders.some((f) => f.id === n.folderId));

  return (
    <div className="cia-ext-notepad">
      {/* Header */}
      <div className="cia-ext-notepad-header">
        <span className="cia-ext-notepad-icon">📝</span>
        <NoteTitle note={activeNote} onRename={renameNote} />

        {/* File menu */}
        <div className="cia-ext-notepad-filemenu">
          <button
            className={`cia-ext-notepad-file-btn${fileMenuOpen ? " is-active" : ""}`}
            onClick={() => setFileMenuOpen((v) => !v)}
            title="File actions"
          >
            🗂 File ⌄
          </button>
          {fileMenuOpen && (
            <>
              <div className="cia-ext-notepad-file-backdrop" onClick={closeFileMenu} />
              <div className="cia-ext-notepad-file-pop" role="menu">
                <div className="cia-ext-notepad-file-label">This note</div>
                <button onClick={() => { saveNote(); closeFileMenu(); }}>💾 Save</button>
                <button onClick={saveNoteToFile}>🗂 Save to file (drag back in to re-add)</button>
                <button onClick={() => downloadAs("txt")}>⬇ Download — Plain text (.txt)</button>
                <button onClick={() => downloadAs("md")}>⬇ Download — Markdown (.md)</button>
                <button onClick={() => void downloadAs("html")}>⬇ Download — Web page (.html)</button>
                <button onClick={() => void downloadAs("docx")}>📄 Download — Word (.docx)</button>
                <button onClick={() => void summaryReportPdf()}>📑 Summary report (.pdf)</button>
                <div className="cia-ext-notepad-file-label">All notes</div>
                <button onClick={() => void downloadAllZip()} disabled={zipping}>
                  🗜 {zipping ? "Zipping…" : "Download all as ZIP (.docx + .pdf)"}
                </button>
              </div>
            </>
          )}
        </div>

        <button
          className={`cia-ext-notepad-upload-toggle${showUpload ? " is-active" : ""}`}
          onClick={() => setShowUpload((v) => !v)}
          title="Import a schedule"
        >
          📅 Schedule
        </button>
        <button className="cia-ext-icon-btn" onClick={() => { saveNote(); onClose(); }} title="Close">✕</button>
      </div>

      {/* Schedule uploader (collapsible) */}
      {showUpload && <ScheduleUploader onScheduleLoaded={handleScheduleLoaded} />}

      {/* Tab navbar — folders, then ungrouped tabs. Drag tabs to file/reorder. */}
      <div className="cia-ext-notepad-tabs">
        {folders.map((f) => {
          const folderNotes = notes.filter((n) => n.folderId === f.id);
          return (
            <div key={f.id} className="cia-ext-notepad-folder-group">
              <FolderChip
                folder={f}
                count={folderNotes.length}
                isDrop={dropTarget === `folder:${f.id}`}
                onToggle={() => toggleFolder(f.id)}
                onRename={(name) => renameFolder(f.id, name)}
                onDelete={() => deleteFolder(f.id)}
                onDragOver={(e) => { e.preventDefault(); setDropTarget(`folder:${f.id}`); }}
                onDrop={(e) => { e.stopPropagation(); handleDrop(`folder:${f.id}`); }}
              />
              {!f.collapsed && folderNotes.map(renderTab)}
            </div>
          );
        })}

        {/* Ungrouped notes — also the drop zone that removes a tab from a folder */}
        <div
          className={`cia-ext-notepad-ungrouped${dropTarget === "ungrouped" ? " is-drop" : ""}`}
          onDragOver={(e) => { e.preventDefault(); if (!dropTarget?.startsWith("note:")) setDropTarget("ungrouped"); }}
          onDrop={() => handleDrop("ungrouped")}
        >
          {ungroupedNotes.map(renderTab)}
        </div>

        <button className="cia-ext-notepad-tab-btn" onClick={addNote} title="New note">+</button>
        <button className="cia-ext-notepad-tab-btn" onClick={addFolder} title="New folder">📁</button>
      </div>

      {/* Toolbar */}
      <div className="cia-ext-notepad-toolbar">
        <select className="cia-ext-notepad-font" value={font} onChange={(e) => setFont(e.target.value)} title="Font family">
          {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>
        <div className="cia-ext-notepad-sep" />
        <button className="cia-ext-notepad-btn" title="Bold (Ctrl+B)" onClick={() => exec("bold")}><b>B</b></button>
        <button className="cia-ext-notepad-btn" title="Italic (Ctrl+I)" onClick={() => exec("italic")}><i>I</i></button>
        <button className="cia-ext-notepad-btn" title="Underline (Ctrl+U)" onClick={() => exec("underline")}><u>U</u></button>
        <div className="cia-ext-notepad-sep" />
        <div className="cia-ext-notepad-listmenu">
          <button
            className={`cia-ext-notepad-btn${listMenuOpen ? " is-active" : ""}`}
            title="Lists"
            onClick={() => setListMenuOpen((v) => !v)}
          >
            ☰ List ⌄
          </button>
          {listMenuOpen && (
            <>
              <div className="cia-ext-notepad-list-backdrop" onClick={() => setListMenuOpen(false)} />
              <div className="cia-ext-notepad-list-pop" role="menu">
                <div className="cia-ext-notepad-list-label">Bulleted</div>
                <button onClick={() => insertList("disc")}>● Filled bullet</button>
                <button onClick={() => insertList("circle")}>○ Hollow bullet</button>
                <button onClick={() => insertList("square")}>▪ Square bullet</button>
                <div className="cia-ext-notepad-list-label">Numbered</div>
                <button onClick={() => insertList("decimal")}>1. Numbers</button>
                <button onClick={() => insertList("lower-alpha")}>a. Letters</button>
                <button onClick={() => insertList("lower-roman")}>i. Roman</button>
              </div>
            </>
          )}
        </div>
        <div className="cia-ext-notepad-sep" />
        <button className="cia-ext-notepad-btn" title="Insert table" onClick={() => insertTable(3, 3)}>⊞ Table</button>
        <div className="cia-ext-notepad-sep" />
        <div className="cia-ext-notepad-listmenu">
          <button
            className={`cia-ext-notepad-btn${templateMenuOpen ? " is-active" : ""}`}
            title="Insert a template"
            onClick={() => setTemplateMenuOpen((v) => !v)}
          >
            ＋ Template ⌄
          </button>
          {templateMenuOpen && (
            <>
              <div className="cia-ext-notepad-list-backdrop" onClick={() => setTemplateMenuOpen(false)} />
              <div className="cia-ext-notepad-list-pop cia-ext-notepad-tpl-pop" role="menu">
                <div className="cia-ext-notepad-list-label">Insert template</div>
                {NOTE_TEMPLATES.map((tpl) => (
                  <button key={tpl.id} className="cia-ext-notepad-tpl-item" onClick={() => insertTemplate(tpl)}>
                    <span className="cia-ext-notepad-tpl-icon">{tpl.icon}</span>
                    <span className="cia-ext-notepad-tpl-text">
                      <strong>{tpl.label}</strong>
                      <small>{tpl.desc}</small>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="cia-ext-notepad-sep" />
        <div className="cia-ext-notepad-listmenu">
          <button
            className={`cia-ext-notepad-btn cia-ext-notepad-ai-btn${aiMenuOpen ? " is-active" : ""}`}
            title="Assistant — AI writing help"
            onClick={() => setAiMenuOpen((v) => !v)}
            disabled={aiBusy}
          >
            ✨ Assistant ⌄
          </button>
          {aiMenuOpen && (
            <>
              <div className="cia-ext-notepad-list-backdrop" onClick={() => setAiMenuOpen(false)} />
              <div className="cia-ext-notepad-list-pop cia-ext-notepad-tpl-pop" role="menu">
                <div className="cia-ext-notepad-list-label">Edit &amp; improve</div>
                {AI_ACTIONS.map((a) => (
                  <button key={a.id} className="cia-ext-notepad-tpl-item" onClick={() => void runAi(a)}>
                    <span className="cia-ext-notepad-tpl-icon">{a.icon}</span>
                    <span className="cia-ext-notepad-tpl-text"><strong>{a.label}</strong></span>
                  </button>
                ))}
                <div className="cia-ext-notepad-list-label">Ask</div>
                <button className="cia-ext-notepad-tpl-item" onClick={() => { setAiMenuOpen(false); setAskOpen(true); }}>
                  <span className="cia-ext-notepad-tpl-icon">💬</span>
                  <span className="cia-ext-notepad-tpl-text"><strong>Ask the assistant…</strong></span>
                </button>
              </div>
            </>
          )}
        </div>
        <div className="cia-ext-notepad-sep" />
        <button className={`cia-ext-notepad-btn${showShortcodes ? " is-active" : ""}`} title="Shortcodes" onClick={() => setShowShortcodes((v) => !v)}>{"{ }"}</button>
      </div>

      {/* Shortcodes */}
      {showShortcodes && (
        <div className="cia-ext-notepad-shortcodes">
          <div className="cia-ext-notepad-sc-hint">Click to insert — or type in editor and press Space</div>
          <div className="cia-ext-notepad-sc-grid">
            {SHORTCODE_HELP.map(({ code, label, desc }) => (
              <button key={code} className="cia-ext-notepad-sc-btn" onClick={() => { insertHtml(`<span>${SHORTCODES[code]()}</span>`); setShowShortcodes(false); }}>
                <code>{label}</code><span>{desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Contextual table tools — appear when the caret is inside a table */}
      {inTable && (
        <div className="cia-ext-notepad-tabletools" onMouseDown={(e) => e.preventDefault()}>
          <span className="cia-ext-notepad-tt-label">Table</span>
          <button className="cia-ext-notepad-btn" title="Insert row above" onClick={() => insertTableRow("above")}>⤒ Row</button>
          <button className="cia-ext-notepad-btn" title="Insert row below" onClick={() => insertTableRow("below")}>⤓ Row</button>
          <button className="cia-ext-notepad-btn" title="Insert column left" onClick={() => insertTableCol("left")}>⇤ Col</button>
          <button className="cia-ext-notepad-btn" title="Insert column right" onClick={() => insertTableCol("right")}>⇥ Col</button>
          <div className="cia-ext-notepad-sep" />
          <button className="cia-ext-notepad-btn" title="Delete row" onClick={deleteTableRow}>✕ Row</button>
          <button className="cia-ext-notepad-btn" title="Delete column" onClick={deleteTableCol}>✕ Col</button>
          <button className="cia-ext-notepad-btn cia-ext-notepad-tt-del" title="Delete table" onClick={deleteTable}>🗑 Table</button>
        </div>
      )}

      {/* AI: custom prompt input */}
      {askOpen && !aiBusy ? (
        <div className="cia-ext-notepad-ai-ask">
          <span className="cia-ext-notepad-ai-ask-icon" aria-hidden="true">✨</span>
          <input
            className="cia-ext-notepad-ai-input"
            autoFocus
            placeholder="Ask the assistant to help with this note…"
            value={askText}
            onChange={(e) => setAskText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && askText.trim()) { void runAi({ id: "ask", label: "Assistant", mode: "append" }, askText.trim()); setAskText(""); }
              if (e.key === "Escape") setAskOpen(false);
            }}
          />
          <button
            className="cia-ext-primary-btn"
            disabled={!askText.trim()}
            onClick={() => { void runAi({ id: "ask", label: "Assistant", mode: "append" }, askText.trim()); setAskText(""); }}
          >
            Send
          </button>
          <button className="cia-ext-icon-btn" onClick={() => setAskOpen(false)} aria-label="Close">✕</button>
        </div>
      ) : null}

      {/* AI: live generation preview */}
      {aiBusy ? (
        <div className="cia-ext-notepad-ai-preview">
          <div className="cia-ext-notepad-ai-preview-head">
            <span className="cia-ext-notepad-ai-spinner" aria-hidden="true" />
            <span>✨ {aiLabel}…</span>
            <button className="cia-ext-notepad-ai-cancel" onClick={cancelAi}>Stop</button>
          </div>
          <div className="cia-ext-notepad-ai-preview-body">{aiPreview || "Thinking…"}</div>
        </div>
      ) : null}

      {/* AI: error */}
      {aiError ? (
        <div className="cia-ext-notepad-ai-error">
          <span>{aiError}</span>
          <button onClick={() => setAiError("")} aria-label="Dismiss">✕</button>
        </div>
      ) : null}

      {/* Inline assistant: floating ✨ icon on a text selection */}
      {selTool && !inlineResult ? (
        <div
          className="cia-ext-notepad-seltool"
          style={{ left: selTool.x, top: selTool.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            type="button"
            className="cia-ext-notepad-seltool-btn"
            onClick={() => setInlineMenuOpen((v) => !v)}
            title="Improve the selection with AI"
          >
            ✨
          </button>
          {inlineMenuOpen ? (
            <div className="cia-ext-notepad-seltool-menu" role="menu">
              {SELECTION_ACTIONS.map((a) => (
                <button key={a.id} type="button" onClick={() => void runInlineAi(a)}>
                  <span aria-hidden="true">{a.icon}</span> {a.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Inline assistant: suggestion with accept / keep-mine */}
      {inlineResult ? (
        <div
          className="cia-ext-notepad-inline-card"
          style={{ left: inlineResult.x, top: inlineResult.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="cia-ext-notepad-inline-head">
            {inlineResult.busy ? <span className="cia-ext-notepad-ai-spinner" aria-hidden="true" /> : <span aria-hidden="true">✨</span>}
            <span className="cia-ext-notepad-inline-title">{inlineResult.label}</span>
            <button type="button" className="cia-ext-notepad-inline-x" onClick={discardInline} aria-label="Close">×</button>
          </div>
          <div className="cia-ext-notepad-inline-body">{inlineResult.text || "Thinking…"}</div>
          <div className="cia-ext-notepad-inline-actions">
            <button type="button" className="cia-ext-primary-btn" disabled={inlineResult.busy || !inlineResult.text} onClick={acceptInline}>✓ Use this</button>
            <button type="button" className="cia-ext-secondary-btn" onClick={discardInline}>Keep mine</button>
          </div>
        </div>
      ) : null}

      {/* Editor */}
      <div
        ref={editorRef}
        className={`cia-ext-notepad-editor${fileDrag ? " is-filedrag" : ""}`}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyUp={(e) => { handleKeyUp(e); updateSelectionTool(); }}
        onKeyDown={handleEditorKeyDown}
        onMouseUp={() => { trackCell(); updateSelectionTool(); }}
        onClick={trackCell}
        onScroll={() => setSelTool(null)}
        onDragOver={(e) => {
          if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setFileDrag(true); }
        }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setFileDrag(false); }}
        onDrop={(e) => {
          if (e.dataTransfer?.files?.length) {
            e.preventDefault();
            setFileDrag(false);
            void importNoteFiles(e.dataTransfer.files);
          }
        }}
        data-placeholder="Start typing… use {ts} for timestamp, drag in a saved .note.html file, or import a schedule above…"
      />

      {/* Footer */}
    </div>
  );
}

function shortProjectName(project) {
  // Strip a leading region/state code prefix (e.g. "VIC_") for a clean tab name.
  const name = project.replace(/^[A-Za-z]{2,3}_/, "").trim();
  return name || project.slice(0, 30);
}

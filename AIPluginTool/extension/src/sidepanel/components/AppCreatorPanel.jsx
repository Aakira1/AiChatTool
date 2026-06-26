import { useCallback, useEffect, useRef, useState } from "react";
import { getStored, setStored } from "../../lib/storage.js";

const STORAGE_KEY = "customApps";

// ── Widget type registry ───────────────────────────────────────────────────
const WIDGET_TYPES = [
  // Layout
  { type: "header", label: "Header", desc: "Section heading with subtitle", category: "layout", defaults: { title: "Section", subtitle: "" } },
  { type: "divider", label: "Divider", desc: "Visual separator", category: "layout", defaults: { title: "", style: "line" } },
  // Productivity
  { type: "kanban", label: "Kanban Board", desc: "Columns with draggable cards", category: "productivity", defaults: { title: "Board", columns: [{ id: "todo", name: "To Do", cards: [{ id: "c1", text: "" }] }, { id: "doing", name: "In Progress", cards: [] }, { id: "done", name: "Done", cards: [] }] } },
  { type: "checklist", label: "Checklist", desc: "Track tasks with checkboxes", category: "productivity", defaults: { title: "To do", items: [{ text: "", done: false }] } },
  { type: "counter", label: "Counter", desc: "Tally anything", category: "productivity", defaults: { title: "Count", value: 0, step: 1 } },
  { type: "timer", label: "Timer", desc: "Countdown or stopwatch", category: "productivity", defaults: { title: "Timer", mode: "stopwatch", duration: 300 } },
  { type: "pomodoro", label: "Pomodoro", desc: "Focus timer with break cycles", category: "productivity", defaults: { title: "Pomodoro", work: 25, rest: 5, rounds: 4 } },
  { type: "tracker", label: "Habit Tracker", desc: "Daily streak tracker", category: "productivity", defaults: { title: "Habit", goal: 1, history: {} } },
  { type: "progress", label: "Progress Bar", desc: "Track milestone progress", category: "productivity", defaults: { title: "Progress", current: 0, total: 100, unit: "%" } },
  { type: "countdown", label: "Date Countdown", desc: "Days until a target date", category: "productivity", defaults: { title: "Countdown", targetDate: "", label: "Days left" } },
  // Content
  { type: "notes", label: "Quick Notes", desc: "Plain text scratch pad", category: "content", defaults: { title: "Notes", text: "" } },
  { type: "markdown", label: "Markdown", desc: "Rendered markdown content", category: "content", defaults: { title: "Markdown", text: "# Hello\n\nWrite **markdown** here." } },
  { type: "links", label: "Link Board", desc: "Bookmark collection", category: "content", defaults: { title: "Links", items: [{ label: "", url: "" }] } },
  { type: "table", label: "Data Table", desc: "Editable rows and columns", category: "content", defaults: { title: "Table", columns: ["Name", "Value", "Notes"], rows: [["", "", ""]] } },
  { type: "contacts", label: "Contacts", desc: "Contact directory", category: "content", defaults: { title: "Contacts", items: [{ name: "", role: "", email: "", phone: "" }] } },
  { type: "flashcards", label: "Flashcards", desc: "Study cards with flip", category: "content", defaults: { title: "Flashcards", cards: [{ front: "Question", back: "Answer" }], index: 0 } },
  { type: "proscons", label: "Pros & Cons", desc: "Decision-making list", category: "content", defaults: { title: "Decision", pros: [""], cons: [""] } },
  { type: "embed", label: "Embed", desc: "Embed a webpage via URL", category: "content", defaults: { title: "Embed", url: "", height: 300 } },
  { type: "image", label: "Image", desc: "Display an image from URL", category: "content", defaults: { title: "Image", url: "", caption: "" } },
  // Utility
  { type: "converter", label: "Unit Converter", desc: "Convert between units", category: "utility", defaults: { title: "Converter", category: "length" } },
  { type: "calculator", label: "Calculator", desc: "Basic calculator", category: "utility", defaults: { title: "Calculator" } },
  { type: "dice", label: "Dice & Random", desc: "Roll dice or pick random numbers", category: "utility", defaults: { title: "Dice", sides: 6, count: 1, results: [] } },
  { type: "json", label: "JSON Viewer", desc: "View and edit JSON data", category: "utility", defaults: { title: "JSON", text: '{\n  "key": "value"\n}' } },
  { type: "colorpicker", label: "Color Palette", desc: "Pick and save colors", category: "utility", defaults: { title: "Colors", colors: ["#7c3aed", "#e4007c", "#f7941d", "#16a34a", "#0ea5e9"], current: "#7c3aed" } },
  { type: "poll", label: "Poll", desc: "Quick voting widget", category: "utility", defaults: { title: "Poll", question: "Which option?", options: [{ text: "Option A", votes: 0 }, { text: "Option B", votes: 0 }] } },
  { type: "budget", label: "Budget", desc: "Simple income & expense tracker", category: "utility", defaults: { title: "Budget", entries: [{ label: "", amount: 0, type: "expense" }] } },
  { type: "scripter", label: "Scripter", desc: "Run custom JavaScript", category: "utility", defaults: { title: "Script", code: '// Write JavaScript here\nreturn "Hello!";', autoRun: false } },
  { type: "quotes", label: "Quotes", desc: "Rotating motivational quotes", category: "utility", defaults: { title: "Quotes", items: ["The best way to predict the future is to create it.", "Done is better than perfect.", "Ship it."] } },
];

const WIDGET_CATEGORIES = [
  { id: "layout", label: "Layout" },
  { id: "productivity", label: "Productivity" },
  { id: "content", label: "Content" },
  { id: "utility", label: "Utility" },
];

const EMOJI_PICKS = ["📋", "⏱", "🔗", "📊", "🎯", "🧮", "📌", "💡", "🗂", "🔔", "📐", "🏷"];

async function loadApps() { const { [STORAGE_KEY]: d } = await getStored([STORAGE_KEY]); return Array.isArray(d) ? d : []; }
async function saveApps(apps) { await setStored({ [STORAGE_KEY]: apps }); }

// ────────────────────────────────────────────────────────────────────────────
// WIDGET RENDERERS
// ────────────────────────────────────────────────────────────────────────────

function HeaderWidget({ data, onChange, editMode }) {
  if (editMode) return (<div className="cia-ext-ca-widget-body"><input className="cia-ext-ca-header-input" value={data.title ?? ""} onChange={(e) => onChange({ ...data, title: e.target.value })} placeholder="Heading" /><input className="cia-ext-ca-header-sub-input" value={data.subtitle ?? ""} onChange={(e) => onChange({ ...data, subtitle: e.target.value })} placeholder="Subtitle (optional)" /></div>);
  return (<div className="cia-ext-ca-header-display"><h3 className="cia-ext-ca-header-title">{data.title || "Untitled"}</h3>{data.subtitle && <p className="cia-ext-ca-header-subtitle">{data.subtitle}</p>}</div>);
}

function DividerWidget({ data, onChange, editMode }) {
  const s = data.style ?? "line";
  if (editMode) return (<div className="cia-ext-ca-widget-body"><div className="cia-ext-ca-divider-options">{["line","dashed","dotted","thick","space"].map((v) => (<button key={v} className={`cia-ext-ca-divider-opt${s === v ? " is-active" : ""}`} onClick={() => onChange({ ...data, style: v })}>{v}</button>))}</div></div>);
  if (s === "space") return <div className="cia-ext-ca-divider-space" />;
  return <hr className={`cia-ext-ca-divider cia-ext-ca-divider-${s}`} />;
}

// ── Kanban ──────────────────────────────────────────────────────────────────
function KanbanWidget({ data, onChange }) {
  const columns = data.columns ?? [];
  const [dragCard, setDragCard] = useState(null); // { colIdx, cardIdx }

  const setCol = (ci, col) => onChange({ ...data, columns: columns.map((c, i) => i === ci ? col : c) });
  const addCard = (ci) => setCol(ci, { ...columns[ci], cards: [...columns[ci].cards, { id: `c${Date.now()}`, text: "" }] });
  const removeCard = (ci, cri) => setCol(ci, { ...columns[ci], cards: columns[ci].cards.filter((_, j) => j !== cri) });
  const setCardText = (ci, cri, text) => setCol(ci, { ...columns[ci], cards: columns[ci].cards.map((c, j) => j === cri ? { ...c, text } : c) });
  const addColumn = () => onChange({ ...data, columns: [...columns, { id: `col${Date.now()}`, name: "New", cards: [] }] });
  const removeColumn = (ci) => onChange({ ...data, columns: columns.filter((_, i) => i !== ci) });
  const renameColumn = (ci, name) => setCol(ci, { ...columns[ci], name });

  const handleDragStart = (colIdx, cardIdx) => (e) => { setDragCard({ colIdx, cardIdx }); e.dataTransfer.effectAllowed = "move"; };
  const handleDrop = (targetColIdx) => (e) => {
    e.preventDefault();
    if (!dragCard) return;
    const { colIdx: srcCI, cardIdx: srcCRI } = dragCard;
    if (srcCI === targetColIdx) { setDragCard(null); return; }
    const card = columns[srcCI].cards[srcCRI];
    const next = columns.map((col, ci) => {
      if (ci === srcCI) return { ...col, cards: col.cards.filter((_, j) => j !== srcCRI) };
      if (ci === targetColIdx) return { ...col, cards: [...col.cards, card] };
      return col;
    });
    onChange({ ...data, columns: next });
    setDragCard(null);
  };

  return (
    <div className="cia-ext-ca-widget-body">
      <div className="cia-ext-ca-kb-board">
        {columns.map((col, ci) => (
          <div key={col.id} className="cia-ext-ca-kb-col" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop(ci)}>
            <div className="cia-ext-ca-kb-col-head">
              <input className="cia-ext-ca-kb-col-name" value={col.name} onChange={(e) => renameColumn(ci, e.target.value)} />
              <span className="cia-ext-ca-kb-col-count">{col.cards.length}</span>
              {columns.length > 1 && <button className="cia-ext-ca-remove-sm" onClick={() => removeColumn(ci)}>×</button>}
            </div>
            <div className="cia-ext-ca-kb-cards">
              {col.cards.map((card, cri) => (
                <div key={card.id} className="cia-ext-ca-kb-card" draggable onDragStart={handleDragStart(ci, cri)} onDragEnd={() => setDragCard(null)}>
                  <input className="cia-ext-ca-kb-card-input" value={card.text} onChange={(e) => setCardText(ci, cri, e.target.value)} placeholder="Card…" />
                  <button className="cia-ext-ca-remove-sm" onClick={() => removeCard(ci, cri)}>×</button>
                </div>
              ))}
            </div>
            <button className="cia-ext-ca-add-btn" onClick={() => addCard(ci)}>Add card</button>
          </div>
        ))}
      </div>
      <button className="cia-ext-ca-add-btn" onClick={addColumn} style={{ marginTop: 6 }}>Add column</button>
    </div>
  );
}

function ChecklistWidget({ data, onChange }) {
  const items = data.items ?? [];
  const done = items.filter((i) => i.done).length;
  return (
    <div className="cia-ext-ca-widget-body">
      <div className="cia-ext-ca-progress-bar"><span style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} /></div>
      <div className="cia-ext-ca-progress-label">{done}/{items.length} done</div>
      <ul className="cia-ext-ca-checklist">
        {items.map((it, i) => (
          <li key={i}>
            <input type="checkbox" checked={it.done} onChange={() => onChange({ ...data, items: items.map((x, j) => j === i ? { ...x, done: !x.done } : x) })} />
            <input className="cia-ext-ca-checklist-text" value={it.text} onChange={(e) => onChange({ ...data, items: items.map((x, j) => j === i ? { ...x, text: e.target.value } : x) })} placeholder="Item…" style={it.done ? { textDecoration: "line-through", opacity: 0.5 } : {}} />
            <button className="cia-ext-ca-remove-sm" onClick={() => onChange({ ...data, items: items.filter((_, j) => j !== i) })}>×</button>
          </li>
        ))}
      </ul>
      <button className="cia-ext-ca-add-btn" onClick={() => onChange({ ...data, items: [...items, { text: "", done: false }] })}>Add item</button>
    </div>
  );
}

function CounterWidget({ data, onChange }) {
  const { value = 0, step = 1 } = data;
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-counter">
      <div className="cia-ext-ca-counter-val">{value}</div>
      <div className="cia-ext-ca-counter-actions">
        <button onClick={() => onChange({ ...data, value: value - step })}>−</button>
        <button onClick={() => onChange({ ...data, value: value + step })}>+</button>
        <button className="cia-ext-ca-counter-reset" onClick={() => onChange({ ...data, value: 0 })}>Reset</button>
      </div>
      <label className="cia-ext-ca-counter-step">Step <input type="number" min="1" value={step} onChange={(e) => onChange({ ...data, step: Math.max(1, +e.target.value || 1) })} /></label>
    </div>
  );
}

function TimerWidget({ data, onChange }) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const ref = useRef(null);
  const sw = data.mode !== "countdown";
  const dur = (data.duration ?? 300) * 1000;
  useEffect(() => { if (!running) return; const s = Date.now() - elapsed; ref.current = setInterval(() => { const n = Date.now() - s; if (!sw && n >= dur) { setElapsed(dur); setRunning(false); clearInterval(ref.current); } else setElapsed(n); }, 100); return () => clearInterval(ref.current); }, [running]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = sw ? elapsed : Math.max(0, dur - elapsed);
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-timer">
      <div className="cia-ext-ca-timer-display">{String(Math.floor(d / 60000)).padStart(2, "0")}:{String(Math.floor((d % 60000) / 1000)).padStart(2, "0")}</div>
      <div className="cia-ext-ca-timer-actions"><button onClick={() => setRunning(!running)}>{running ? "Pause" : "Start"}</button><button onClick={() => { setRunning(false); setElapsed(0); }}>Reset</button></div>
      <div className="cia-ext-ca-timer-mode"><button className={sw ? "is-active" : ""} onClick={() => { onChange({ ...data, mode: "stopwatch" }); setElapsed(0); setRunning(false); }}>Stopwatch</button><button className={!sw ? "is-active" : ""} onClick={() => { onChange({ ...data, mode: "countdown" }); setElapsed(0); setRunning(false); }}>Countdown</button></div>
      {!sw && <label className="cia-ext-ca-counter-step">Minutes <input type="number" min="1" value={Math.round((data.duration ?? 300) / 60)} onChange={(e) => onChange({ ...data, duration: Math.max(60, (+e.target.value || 5) * 60) })} /></label>}
    </div>
  );
}

function PomodoroWidget({ data }) {
  const [phase, setPhase] = useState("idle");
  const [remaining, setRemaining] = useState(0);
  const [round, setRound] = useState(1);
  const ref = useRef(null);
  const ws = (data.work ?? 25) * 60, rs = (data.rest ?? 5) * 60, mr = data.rounds ?? 4;
  useEffect(() => { if (phase === "idle") return; ref.current = setInterval(() => { setRemaining((r) => { if (r <= 1) { if (phase === "work") { setPhase("rest"); return rs; } if (round >= mr) { setPhase("idle"); setRound(1); return 0; } setRound((v) => v + 1); setPhase("work"); return ws; } return r - 1; }); }, 1000); return () => clearInterval(ref.current); }, [phase, round]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-timer">
      <div className={`cia-ext-ca-timer-display ${phase === "rest" ? "is-rest" : ""}`}>{String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</div>
      <div className="cia-ext-ca-pomodoro-phase">{phase === "idle" ? "Ready" : phase === "work" ? `Focus — round ${round}/${mr}` : "Break"}</div>
      <div className="cia-ext-ca-timer-actions">{phase === "idle" ? <button onClick={() => { setPhase("work"); setRemaining(ws); }}>Start</button> : <button onClick={() => { clearInterval(ref.current); setPhase("idle"); setRemaining(0); setRound(1); }}>Stop</button>}</div>
    </div>
  );
}

function TrackerWidget({ data, onChange }) {
  const today = new Date().toISOString().slice(0, 10);
  const h = data.history ?? {}, tv = h[today] ?? 0, g = data.goal ?? 1;
  const last7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d.toISOString().slice(0, 10); });
  let streak = 0; for (let i = 0; i < 365; i++) { const d = new Date(); d.setDate(d.getDate() - i); if ((h[d.toISOString().slice(0, 10)] ?? 0) >= g) streak++; else break; }
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-tracker">
      <div className="cia-ext-ca-tracker-streak">{streak} day streak</div>
      <div className="cia-ext-ca-tracker-today">Today: {tv}/{g}<button className="cia-ext-ca-add-btn" onClick={() => onChange({ ...data, history: { ...h, [today]: tv + 1 } })} style={{ marginLeft: 8 }}>Log</button></div>
      <div className="cia-ext-ca-tracker-week">{last7.map((d) => { const v = h[d] ?? 0; return (<div key={d} className="cia-ext-ca-tracker-day" title={`${d}: ${v}/${g}`}><div className="cia-ext-ca-tracker-bar"><span style={{ height: `${Math.min(100, (v / g) * 100)}%` }} /></div><span>{["S","M","T","W","T","F","S"][new Date(d + "T00:00").getDay()]}</span></div>); })}</div>
      <label className="cia-ext-ca-counter-step">Daily goal <input type="number" min="1" value={g} onChange={(e) => onChange({ ...data, goal: Math.max(1, +e.target.value || 1) })} /></label>
    </div>
  );
}

function ProgressWidget({ data, onChange }) {
  const { current = 0, total = 100, unit = "%" } = data;
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-counter">
      <div className="cia-ext-ca-progress-bar" style={{ height: 8, borderRadius: 4 }}><span style={{ width: `${pct}%` }} /></div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "var(--cia-body)", margin: "8px 0 2px" }}>{Math.round(pct)}{unit}</div>
      <div className="cia-ext-ca-progress-label">{current} / {total}</div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 8 }}>
        <label className="cia-ext-ca-counter-step">Current <input type="number" value={current} onChange={(e) => onChange({ ...data, current: +e.target.value || 0 })} /></label>
        <label className="cia-ext-ca-counter-step">Total <input type="number" min="1" value={total} onChange={(e) => onChange({ ...data, total: Math.max(1, +e.target.value || 100) })} /></label>
      </div>
    </div>
  );
}

function CountdownWidget({ data, onChange }) {
  const target = data.targetDate ? new Date(data.targetDate + "T00:00:00") : null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const diff = target ? Math.ceil((target - now) / 86400000) : null;
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-counter">
      <div className="cia-ext-ca-counter-val" style={{ fontSize: diff !== null && diff <= 0 ? 28 : 40 }}>{diff === null ? "—" : diff <= 0 ? "Today!" : diff}</div>
      <div className="cia-ext-ca-progress-label">{data.label || "days remaining"}</div>
      <label className="cia-ext-ca-counter-step" style={{ marginTop: 8 }}>Target <input type="date" value={data.targetDate ?? ""} onChange={(e) => onChange({ ...data, targetDate: e.target.value })} style={{ width: "auto" }} /></label>
    </div>
  );
}

function NotesWidget({ data, onChange }) {
  return <div className="cia-ext-ca-widget-body"><textarea className="cia-ext-ca-notes" value={data.text ?? ""} onChange={(e) => onChange({ ...data, text: e.target.value })} placeholder="Type anything…" rows={5} /></div>;
}

function MarkdownWidget({ data, onChange, editMode }) {
  const [editing, setEditing] = useState(editMode);
  const render = (md) => {
    let html = md.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    html = html.replace(/^### (.+)$/gm, "<h4>$1</h4>");
    html = html.replace(/^## (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^# (.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/`(.+?)`/g, "<code>$1</code>");
    html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");
    html = html.replace(/\n{2,}/g, "<br/><br/>");
    return html;
  };
  if (editing) return (<div className="cia-ext-ca-widget-body"><textarea className="cia-ext-ca-notes" value={data.text ?? ""} onChange={(e) => onChange({ ...data, text: e.target.value })} rows={6} />{!editMode && <button className="cia-ext-ca-add-btn" onClick={() => setEditing(false)} style={{ marginTop: 4 }}>Preview</button>}</div>);
  return (<div className="cia-ext-ca-widget-body"><div className="cia-ext-ca-md-render" dangerouslySetInnerHTML={{ __html: render(data.text ?? "") }} />{!editMode && <button className="cia-ext-ca-add-btn" onClick={() => setEditing(true)} style={{ marginTop: 4 }}>Edit</button>}</div>);
}

function LinksWidget({ data, onChange }) {
  const items = data.items ?? [];
  return (
    <div className="cia-ext-ca-widget-body">
      <div className="cia-ext-ca-links">
        {items.map((it, i) => (
          <div key={i} className="cia-ext-ca-link-row">
            <input value={it.label} onChange={(e) => onChange({ ...data, items: items.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} placeholder="Label" className="cia-ext-ca-link-label" />
            <input value={it.url} onChange={(e) => onChange({ ...data, items: items.map((x, j) => j === i ? { ...x, url: e.target.value } : x) })} placeholder="https://…" className="cia-ext-ca-link-url" />
            {it.url && <a href={it.url} target="_blank" rel="noopener noreferrer" className="cia-ext-ca-link-go">Go</a>}
            <button className="cia-ext-ca-remove-sm" onClick={() => onChange({ ...data, items: items.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
      </div>
      <button className="cia-ext-ca-add-btn" onClick={() => onChange({ ...data, items: [...items, { label: "", url: "" }] })}>Add link</button>
    </div>
  );
}

function TableWidget({ data, onChange }) {
  const cols = data.columns ?? ["A", "B"];
  const rows = data.rows ?? [[]];
  const setCell = (ri, ci, v) => onChange({ ...data, rows: rows.map((r, i) => i === ri ? r.map((c, j) => j === ci ? v : c) : r) });
  const setColName = (ci, v) => onChange({ ...data, columns: cols.map((c, i) => i === ci ? v : c) });
  return (
    <div className="cia-ext-ca-widget-body">
      <div className="cia-ext-ca-tbl-wrap">
        <table className="cia-ext-ca-tbl">
          <thead><tr>{cols.map((c, ci) => <th key={ci}><input value={c} onChange={(e) => setColName(ci, e.target.value)} className="cia-ext-ca-tbl-th" /></th>)}<th><button className="cia-ext-ca-remove-sm" onClick={() => onChange({ ...data, columns: [...cols, `Col ${cols.length + 1}`], rows: rows.map((r) => [...r, ""]) })}>+</button></th></tr></thead>
          <tbody>{rows.map((row, ri) => (<tr key={ri}>{cols.map((_, ci) => <td key={ci}><input value={row[ci] ?? ""} onChange={(e) => setCell(ri, ci, e.target.value)} className="cia-ext-ca-tbl-td" /></td>)}<td><button className="cia-ext-ca-remove-sm" onClick={() => onChange({ ...data, rows: rows.filter((_, i) => i !== ri) })}>×</button></td></tr>))}</tbody>
        </table>
      </div>
      <button className="cia-ext-ca-add-btn" onClick={() => onChange({ ...data, rows: [...rows, cols.map(() => "")] })}>Add row</button>
    </div>
  );
}

function ContactsWidget({ data, onChange }) {
  const items = data.items ?? [];
  const set = (i, f, v) => onChange({ ...data, items: items.map((x, j) => j === i ? { ...x, [f]: v } : x) });
  return (
    <div className="cia-ext-ca-widget-body">
      {items.map((c, i) => (
        <div key={i} className="cia-ext-ca-contact-card">
          <input value={c.name} onChange={(e) => set(i, "name", e.target.value)} placeholder="Name" className="cia-ext-ca-contact-name" />
          <input value={c.role} onChange={(e) => set(i, "role", e.target.value)} placeholder="Role" className="cia-ext-ca-contact-field" />
          <input value={c.email} onChange={(e) => set(i, "email", e.target.value)} placeholder="Email" className="cia-ext-ca-contact-field" />
          <input value={c.phone} onChange={(e) => set(i, "phone", e.target.value)} placeholder="Phone" className="cia-ext-ca-contact-field" />
          <button className="cia-ext-ca-remove-sm" onClick={() => onChange({ ...data, items: items.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      <button className="cia-ext-ca-add-btn" onClick={() => onChange({ ...data, items: [...items, { name: "", role: "", email: "", phone: "" }] })}>Add contact</button>
    </div>
  );
}

function FlashcardsWidget({ data, onChange }) {
  const cards = data.cards ?? [];
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[idx];
  if (!cards.length) return <div className="cia-ext-ca-widget-body cia-ext-ca-empty">No cards. Add some below.</div>;
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-counter">
      <div className={`cia-ext-ca-fc-card${flipped ? " is-flipped" : ""}`} onClick={() => setFlipped(!flipped)}>
        <div className="cia-ext-ca-fc-face">{flipped ? card.back : card.front}</div>
      </div>
      <div className="cia-ext-ca-progress-label">{idx + 1} / {cards.length} · Click to flip</div>
      <div className="cia-ext-ca-counter-actions" style={{ marginTop: 6 }}>
        <button disabled={idx === 0} onClick={() => { setIdx(idx - 1); setFlipped(false); }}>Prev</button>
        <button disabled={idx >= cards.length - 1} onClick={() => { setIdx(idx + 1); setFlipped(false); }}>Next</button>
        <button onClick={() => { setIdx(Math.floor(Math.random() * cards.length)); setFlipped(false); }}>Random</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
        {cards.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 4 }}>
            <input value={c.front} onChange={(e) => onChange({ ...data, cards: cards.map((x, j) => j === i ? { ...x, front: e.target.value } : x) })} placeholder="Front" style={{ flex: 1, border: "1px solid var(--cia-border)", borderRadius: 4, padding: "3px 6px", fontSize: 11, fontFamily: "inherit" }} />
            <input value={c.back} onChange={(e) => onChange({ ...data, cards: cards.map((x, j) => j === i ? { ...x, back: e.target.value } : x) })} placeholder="Back" style={{ flex: 1, border: "1px solid var(--cia-border)", borderRadius: 4, padding: "3px 6px", fontSize: 11, fontFamily: "inherit" }} />
            <button className="cia-ext-ca-remove-sm" onClick={() => { const next = cards.filter((_, j) => j !== i); onChange({ ...data, cards: next }); if (idx >= next.length) setIdx(Math.max(0, next.length - 1)); }}>×</button>
          </div>
        ))}
      </div>
      <button className="cia-ext-ca-add-btn" onClick={() => onChange({ ...data, cards: [...cards, { front: "", back: "" }] })} style={{ marginTop: 4 }}>Add card</button>
    </div>
  );
}

function ProsConsWidget({ data, onChange }) {
  const pros = data.pros ?? [], cons = data.cons ?? [];
  const setItem = (side, i, v) => onChange({ ...data, [side]: data[side].map((x, j) => j === i ? v : x) });
  const add = (side) => onChange({ ...data, [side]: [...data[side], ""] });
  const remove = (side, i) => onChange({ ...data, [side]: data[side].filter((_, j) => j !== i) });
  return (
    <div className="cia-ext-ca-widget-body">
      <div className="cia-ext-ca-pc-grid">
        <div className="cia-ext-ca-pc-col cia-ext-ca-pc-pro">
          <div className="cia-ext-ca-pc-head">Pros</div>
          {pros.map((p, i) => (<div key={i} className="cia-ext-ca-pc-row"><input value={p} onChange={(e) => setItem("pros", i, e.target.value)} placeholder="Pro…" /><button className="cia-ext-ca-remove-sm" onClick={() => remove("pros", i)}>×</button></div>))}
          <button className="cia-ext-ca-add-btn" onClick={() => add("pros")}>Add</button>
        </div>
        <div className="cia-ext-ca-pc-col cia-ext-ca-pc-con">
          <div className="cia-ext-ca-pc-head">Cons</div>
          {cons.map((c, i) => (<div key={i} className="cia-ext-ca-pc-row"><input value={c} onChange={(e) => setItem("cons", i, e.target.value)} placeholder="Con…" /><button className="cia-ext-ca-remove-sm" onClick={() => remove("cons", i)}>×</button></div>))}
          <button className="cia-ext-ca-add-btn" onClick={() => add("cons")}>Add</button>
        </div>
      </div>
    </div>
  );
}

function EmbedWidget({ data, onChange }) {
  return (
    <div className="cia-ext-ca-widget-body">
      <input value={data.url ?? ""} onChange={(e) => onChange({ ...data, url: e.target.value })} placeholder="https://example.com" style={{ width: "100%", border: "1px solid var(--cia-border)", borderRadius: 6, padding: "5px 8px", fontSize: 12, fontFamily: "inherit", marginBottom: 6 }} />
      {data.url ? <iframe src={data.url} title={data.title} style={{ width: "100%", height: data.height ?? 300, border: "1px solid var(--cia-border)", borderRadius: 6 }} sandbox="allow-scripts allow-same-origin" /> : <div className="cia-ext-ca-empty">Enter a URL above</div>}
    </div>
  );
}

function ImageWidget({ data, onChange }) {
  return (
    <div className="cia-ext-ca-widget-body">
      <input value={data.url ?? ""} onChange={(e) => onChange({ ...data, url: e.target.value })} placeholder="Image URL…" style={{ width: "100%", border: "1px solid var(--cia-border)", borderRadius: 6, padding: "5px 8px", fontSize: 12, fontFamily: "inherit", marginBottom: 6 }} />
      {data.url ? <img src={data.url} alt={data.caption || "Image"} style={{ width: "100%", borderRadius: 6, maxHeight: 300, objectFit: "cover" }} /> : <div className="cia-ext-ca-empty">Enter an image URL</div>}
      {data.url && <input value={data.caption ?? ""} onChange={(e) => onChange({ ...data, caption: e.target.value })} placeholder="Caption (optional)" style={{ width: "100%", border: "1px solid var(--cia-border)", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontFamily: "inherit", marginTop: 4, color: "var(--cia-muted)" }} />}
    </div>
  );
}

// ── Utility widgets ────────────────────────────────────────────────────────

const UNITS = {
  length: { label: "Length", units: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.34, ft: 0.3048, in: 0.0254 } },
  weight: { label: "Weight", units: { kg: 1, g: 0.001, mg: 0.000001, lb: 0.453592, oz: 0.0283495 } },
  temperature: { label: "Temp", units: { "°C": "c", "°F": "f", K: "k" } },
  time: { label: "Time", units: { sec: 1, min: 60, hr: 3600, day: 86400, wk: 604800 } },
  data: { label: "Data", units: { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 } },
};
function convertTemp(v, f, t) { let c; if (f === "c") c = v; else if (f === "f") c = (v - 32) * 5 / 9; else c = v - 273.15; if (t === "c") return c; if (t === "f") return c * 9 / 5 + 32; return c + 273.15; }

function ConverterWidget({ data, onChange }) {
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [val, setVal] = useState("1");
  const cat = data.category ?? "length"; const info = UNITS[cat]; const keys = Object.keys(info.units);
  useEffect(() => { setFrom(keys[0]); setTo(keys[1] ?? keys[0]); }, [cat]); // eslint-disable-line react-hooks/exhaustive-deps
  const result = (() => { const n = parseFloat(val); if (isNaN(n)) return "—"; if (cat === "temperature") return convertTemp(n, info.units[from], info.units[to]).toFixed(4).replace(/\.?0+$/, ""); return ((n * info.units[from]) / info.units[to]).toFixed(6).replace(/\.?0+$/, ""); })();
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-converter">
      <div className="cia-ext-ca-converter-cats">{Object.entries(UNITS).map(([k, v]) => (<button key={k} className={cat === k ? "is-active" : ""} onClick={() => onChange({ ...data, category: k })}>{v.label}</button>))}</div>
      <div className="cia-ext-ca-converter-row"><input type="number" value={val} onChange={(e) => setVal(e.target.value)} className="cia-ext-ca-converter-input" /><select value={from} onChange={(e) => setFrom(e.target.value)}>{keys.map((u) => <option key={u}>{u}</option>)}</select></div>
      <div className="cia-ext-ca-converter-eq">=</div>
      <div className="cia-ext-ca-converter-row"><div className="cia-ext-ca-converter-result">{result}</div><select value={to} onChange={(e) => setTo(e.target.value)}>{keys.map((u) => <option key={u}>{u}</option>)}</select></div>
    </div>
  );
}

function CalculatorWidget() {
  const [display, setDisplay] = useState("0");
  const [expr, setExpr] = useState("");
  const press = (v) => {
    if (v === "C") { setDisplay("0"); setExpr(""); return; }
    if (v === "⌫") { setDisplay((d) => d.length > 1 ? d.slice(0, -1) : "0"); setExpr((e) => e.slice(0, -1)); return; }
    if (v === "=") { try { const r = new Function(`return (${expr})`)(); setDisplay(String(r)); setExpr(String(r)); } catch { setDisplay("Error"); } return; }
    if (v === "±") { setDisplay((d) => d.startsWith("-") ? d.slice(1) : `-${d}`); setExpr((e) => e.startsWith("-") ? e.slice(1) : `-${e}`); return; }
    const op = ["+", "−", "×", "÷"].includes(v);
    const mapped = v === "×" ? "*" : v === "÷" ? "/" : v === "−" ? "-" : v;
    setExpr((e) => e + mapped);
    setDisplay(op ? v : display === "0" || display === "Error" ? v : display + v);
  };
  const btns = ["C", "±", "⌫", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ".", "="];
  return (
    <div className="cia-ext-ca-widget-body">
      <div className="cia-ext-ca-calc-display">{display}</div>
      <div className="cia-ext-ca-calc-grid">{btns.map((b) => (<button key={b} className={`cia-ext-ca-calc-btn${b === "=" ? " is-eq" : ["+","−","×","÷"].includes(b) ? " is-op" : ["C","±","⌫"].includes(b) ? " is-fn" : ""}`} onClick={() => press(b)}>{b}</button>))}</div>
    </div>
  );
}

function DiceWidget({ data, onChange }) {
  const { sides = 6, count = 1, results = [] } = data;
  const roll = () => { const r = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1); onChange({ ...data, results: r }); };
  const total = results.reduce((a, b) => a + b, 0);
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-counter">
      <div className="cia-ext-ca-dice-results">{results.length ? results.map((r, i) => <span key={i} className="cia-ext-ca-dice-die">{r}</span>) : <span className="cia-ext-ca-progress-label">Roll to start</span>}</div>
      {results.length > 1 && <div className="cia-ext-ca-progress-label">Total: {total}</div>}
      <button className="cia-ext-ca-add-btn" onClick={roll} style={{ margin: "8px auto 0", display: "block" }}>Roll</button>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
        <label className="cia-ext-ca-counter-step">Sides <input type="number" min="2" value={sides} onChange={(e) => onChange({ ...data, sides: Math.max(2, +e.target.value || 6) })} /></label>
        <label className="cia-ext-ca-counter-step">Count <input type="number" min="1" max="20" value={count} onChange={(e) => onChange({ ...data, count: Math.min(20, Math.max(1, +e.target.value || 1)) })} /></label>
      </div>
    </div>
  );
}

function JsonWidget({ data, onChange }) {
  const [error, setError] = useState(null);
  const [formatted, setFormatted] = useState(null);
  const format = () => { try { const obj = JSON.parse(data.text ?? "{}"); const pretty = JSON.stringify(obj, null, 2); onChange({ ...data, text: pretty }); setError(null); setFormatted(true); setTimeout(() => setFormatted(null), 1500); } catch (e) { setError(e.message); } };
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-scripter">
      <textarea className="cia-ext-ca-scripter-code" value={data.text ?? ""} onChange={(e) => { onChange({ ...data, text: e.target.value }); setError(null); }} rows={6} spellCheck={false} />
      <div className="cia-ext-ca-scripter-bar"><button className="cia-ext-ca-add-btn" onClick={format}>Format</button>{formatted && <span style={{ fontSize: 11, color: "#16a34a" }}>Formatted</span>}</div>
      {error && <pre className="cia-ext-ca-scripter-error">{error}</pre>}
    </div>
  );
}

function ColorPickerWidget({ data, onChange }) {
  const colors = data.colors ?? []; const current = data.current ?? "#000000";
  return (
    <div className="cia-ext-ca-widget-body">
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {colors.map((c, i) => (
          <div key={i} style={{ position: "relative" }}>
            <button style={{ width: 32, height: 32, borderRadius: 6, border: c === current ? "2px solid var(--cia-purple)" : "1px solid var(--cia-border)", background: c, cursor: "pointer" }} onClick={() => onChange({ ...data, current: c })} title={c} />
            <button className="cia-ext-ca-remove-sm" style={{ position: "absolute", top: -4, right: -4, width: 14, height: 14, fontSize: 9, padding: 0 }} onClick={() => onChange({ ...data, colors: colors.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type="color" value={current} onChange={(e) => onChange({ ...data, current: e.target.value })} style={{ width: 34, height: 28, border: "1px solid var(--cia-border)", borderRadius: 6, padding: 2, cursor: "pointer" }} />
        <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--cia-body)" }}>{current}</span>
        <button className="cia-ext-ca-add-btn" onClick={() => { if (!colors.includes(current)) onChange({ ...data, colors: [...colors, current] }); }}>Save</button>
      </div>
    </div>
  );
}

function PollWidget({ data, onChange }) {
  const options = data.options ?? []; const totalVotes = options.reduce((a, o) => a + (o.votes ?? 0), 0);
  return (
    <div className="cia-ext-ca-widget-body">
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "var(--cia-body)" }}>{data.question || "Question?"}</div>
      <input value={data.question ?? ""} onChange={(e) => onChange({ ...data, question: e.target.value })} placeholder="Question" style={{ width: "100%", border: "1px solid var(--cia-border)", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "inherit", marginBottom: 8 }} />
      {options.map((o, i) => {
        const pct = totalVotes > 0 ? Math.round((o.votes / totalVotes) * 100) : 0;
        return (
          <div key={i} style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 2 }}>
              <input value={o.text} onChange={(e) => onChange({ ...data, options: options.map((x, j) => j === i ? { ...x, text: e.target.value } : x) })} placeholder="Option" style={{ flex: 1, border: "1px solid var(--cia-border)", borderRadius: 4, padding: "3px 6px", fontSize: 12, fontFamily: "inherit" }} />
              <button className="cia-ext-ca-add-btn" onClick={() => onChange({ ...data, options: options.map((x, j) => j === i ? { ...x, votes: (x.votes ?? 0) + 1 } : x) })}>Vote</button>
              <span style={{ fontSize: 11, color: "var(--cia-muted)", minWidth: 30 }}>{o.votes ?? 0}</span>
              <button className="cia-ext-ca-remove-sm" onClick={() => onChange({ ...data, options: options.filter((_, j) => j !== i) })}>×</button>
            </div>
            <div className="cia-ext-ca-progress-bar"><span style={{ width: `${pct}%` }} /></div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <button className="cia-ext-ca-add-btn" onClick={() => onChange({ ...data, options: [...options, { text: "", votes: 0 }] })}>Add option</button>
        <button className="cia-ext-ca-add-btn" onClick={() => onChange({ ...data, options: options.map((o) => ({ ...o, votes: 0 })) })}>Reset votes</button>
      </div>
    </div>
  );
}

function BudgetWidget({ data, onChange }) {
  const entries = data.entries ?? [];
  const income = entries.filter((e) => e.type === "income").reduce((a, e) => a + (parseFloat(e.amount) || 0), 0);
  const expense = entries.filter((e) => e.type === "expense").reduce((a, e) => a + (parseFloat(e.amount) || 0), 0);
  const balance = income - expense;
  return (
    <div className="cia-ext-ca-widget-body">
      <div className="cia-ext-ca-budget-summary">
        <div className="cia-ext-ca-budget-stat"><span>Income</span><strong style={{ color: "#16a34a" }}>${income.toFixed(2)}</strong></div>
        <div className="cia-ext-ca-budget-stat"><span>Expense</span><strong style={{ color: "#dc2626" }}>${expense.toFixed(2)}</strong></div>
        <div className="cia-ext-ca-budget-stat"><span>Balance</span><strong style={{ color: balance >= 0 ? "#16a34a" : "#dc2626" }}>${balance.toFixed(2)}</strong></div>
      </div>
      {entries.map((e, i) => (
        <div key={i} style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 4 }}>
          <select value={e.type} onChange={(ev) => onChange({ ...data, entries: entries.map((x, j) => j === i ? { ...x, type: ev.target.value } : x) })} style={{ border: "1px solid var(--cia-border)", borderRadius: 4, padding: "3px 4px", fontSize: 11, fontFamily: "inherit" }}>
            <option value="income">Income</option><option value="expense">Expense</option>
          </select>
          <input value={e.label} onChange={(ev) => onChange({ ...data, entries: entries.map((x, j) => j === i ? { ...x, label: ev.target.value } : x) })} placeholder="Label" style={{ flex: 1, border: "1px solid var(--cia-border)", borderRadius: 4, padding: "3px 6px", fontSize: 11, fontFamily: "inherit" }} />
          <input type="number" value={e.amount} onChange={(ev) => onChange({ ...data, entries: entries.map((x, j) => j === i ? { ...x, amount: ev.target.value } : x) })} placeholder="0" style={{ width: 60, border: "1px solid var(--cia-border)", borderRadius: 4, padding: "3px 6px", fontSize: 11, fontFamily: "inherit", textAlign: "right" }} />
          <button className="cia-ext-ca-remove-sm" onClick={() => onChange({ ...data, entries: entries.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      <button className="cia-ext-ca-add-btn" onClick={() => onChange({ ...data, entries: [...entries, { label: "", amount: 0, type: "expense" }] })}>Add entry</button>
    </div>
  );
}

function ScripterWidget({ data, onChange }) {
  const [output, setOutput] = useState(null);
  const [error, setError] = useState(null);
  const run = () => { setError(null); setOutput(null); try { const r = new Function(data.code ?? "")(); setOutput(r !== undefined ? String(r) : "(no return value)"); } catch (e) { setError(e.message); } };
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-scripter">
      <textarea className="cia-ext-ca-scripter-code" value={data.code ?? ""} onChange={(e) => onChange({ ...data, code: e.target.value })} placeholder="// JavaScript…" rows={6} spellCheck={false} />
      <div className="cia-ext-ca-scripter-bar"><button className="cia-ext-ca-add-btn" onClick={run}>Run</button><label className="cia-ext-ca-scripter-auto"><input type="checkbox" checked={data.autoRun ?? false} onChange={(e) => onChange({ ...data, autoRun: e.target.checked })} />Auto-run</label></div>
      {output !== null && <pre className="cia-ext-ca-scripter-output">{output}</pre>}
      {error && <pre className="cia-ext-ca-scripter-error">{error}</pre>}
    </div>
  );
}

function QuotesWidget({ data, onChange }) {
  const items = data.items ?? [];
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * Math.max(1, items.length)));
  if (!items.length) return <div className="cia-ext-ca-widget-body cia-ext-ca-empty">Add some quotes below.</div>;
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-counter">
      <div style={{ fontSize: 14, fontStyle: "italic", color: "var(--cia-body)", lineHeight: 1.5, padding: "8px 4px", minHeight: 40 }}>"{items[idx % items.length]}"</div>
      <button className="cia-ext-ca-add-btn" onClick={() => setIdx(Math.floor(Math.random() * items.length))} style={{ margin: "6px auto 0", display: "block" }}>New quote</button>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
        {items.map((q, i) => (
          <div key={i} style={{ display: "flex", gap: 4 }}>
            <input value={q} onChange={(e) => onChange({ ...data, items: items.map((x, j) => j === i ? e.target.value : x) })} style={{ flex: 1, border: "1px solid var(--cia-border)", borderRadius: 4, padding: "3px 6px", fontSize: 11, fontFamily: "inherit" }} />
            <button className="cia-ext-ca-remove-sm" onClick={() => onChange({ ...data, items: items.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
      </div>
      <button className="cia-ext-ca-add-btn" onClick={() => onChange({ ...data, items: [...items, ""] })} style={{ marginTop: 4 }}>Add quote</button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
const WIDGET_MAP = {
  header: HeaderWidget, divider: DividerWidget, kanban: KanbanWidget,
  checklist: ChecklistWidget, counter: CounterWidget, timer: TimerWidget,
  pomodoro: PomodoroWidget, tracker: TrackerWidget, progress: ProgressWidget,
  countdown: CountdownWidget, notes: NotesWidget, markdown: MarkdownWidget,
  links: LinksWidget, table: TableWidget, contacts: ContactsWidget,
  flashcards: FlashcardsWidget, proscons: ProsConsWidget, embed: EmbedWidget,
  image: ImageWidget, converter: ConverterWidget, calculator: CalculatorWidget,
  dice: DiceWidget, json: JsonWidget, colorpicker: ColorPickerWidget,
  poll: PollWidget, budget: BudgetWidget, scripter: ScripterWidget,
  quotes: QuotesWidget,
};

// ── Drag-reorder ───────────────────────────────────────────────────────────
function useDragReorder(widgets, setWidgets) {
  const dragIdx = useRef(null);
  const [dragging, setDragging] = useState(null);
  const onDragStart = (i) => (e) => { dragIdx.current = i; setDragging(i); e.dataTransfer.effectAllowed = "move"; };
  const onDragOver = (i) => (e) => { e.preventDefault(); if (dragIdx.current === null || dragIdx.current === i) return; const next = [...widgets]; const [m] = next.splice(dragIdx.current, 1); next.splice(i, 0, m); dragIdx.current = i; setWidgets(next); };
  const onDragEnd = () => { dragIdx.current = null; setDragging(null); };
  return { dragging, onDragStart, onDragOver, onDragEnd };
}

// ── App editor ─────────────────────────────────────────────────────────────
function AppEditor({ app, onSave, onCancel }) {
  const [name, setName] = useState(app?.name ?? "");
  const [icon, setIcon] = useState(app?.icon ?? "📋");
  const [desc, setDesc] = useState(app?.desc ?? "");
  const [color, setColor] = useState(app?.color ?? "#7c3aed");
  const [widgets, setWidgets] = useState(app?.widgets ?? []);
  const [addingWidget, setAddingWidget] = useState(false);
  const [pickerCat, setPickerCat] = useState("all");

  const { dragging, onDragStart, onDragOver, onDragEnd } = useDragReorder(widgets, setWidgets);
  const updateWidget = (i, data) => setWidgets((ws) => ws.map((w, j) => (j === i ? { ...w, data } : w)));
  const removeWidget = (i) => setWidgets((ws) => ws.filter((_, j) => j !== i));
  const duplicateWidget = (i) => setWidgets((ws) => { const w = { ...ws[i], id: crypto.randomUUID(), data: { ...ws[i].data } }; const next = [...ws]; next.splice(i + 1, 0, w); return next; });
  const addWidget = (wt) => { setWidgets([...widgets, { id: crypto.randomUUID(), type: wt.type, data: { ...wt.defaults } }]); setAddingWidget(false); };
  const valid = name.trim().length > 0;
  const filtered = pickerCat === "all" ? WIDGET_TYPES : WIDGET_TYPES.filter((w) => w.category === pickerCat);

  return (
    <div className="cia-ext-ca-editor">
      <div className="cia-ext-ca-editor-header"><span>{app ? "Edit app" : "Create app"}</span></div>
      <div className="cia-ext-ca-field-group">
        <div className="cia-ext-ca-field"><label>App name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="My App" maxLength={40} /></div>
        <div className="cia-ext-ca-field"><label>Description</label><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What does this app do?" maxLength={80} /></div>
        <div className="cia-ext-ca-field-row">
          <div className="cia-ext-ca-field" style={{ flex: 1 }}><label>Icon</label><div className="cia-ext-ca-emoji-row">{EMOJI_PICKS.map((e) => (<button key={e} className={`cia-ext-ca-emoji-btn${icon === e ? " is-active" : ""}`} onClick={() => setIcon(e)}>{e}</button>))}</div></div>
          <div className="cia-ext-ca-field" style={{ width: 70 }}><label>Color</label><input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="cia-ext-ca-color-pick" /></div>
        </div>
      </div>

      <div className="cia-ext-ca-section-label">Widgets<span className="cia-ext-ca-section-count">{widgets.length}</span></div>
      {widgets.length === 0 && <div className="cia-ext-ca-empty">No widgets yet — add one below.</div>}

      <div className="cia-ext-ca-widget-list">
        {widgets.map((w, i) => {
          const Comp = WIDGET_MAP[w.type];
          const meta = WIDGET_TYPES.find((t) => t.type === w.type);
          const isLayout = w.type === "header" || w.type === "divider";
          return (
            <div key={w.id} className={`cia-ext-ca-widget-card${dragging === i ? " is-dragging" : ""}${isLayout ? " is-layout" : ""}`} draggable onDragStart={onDragStart(i)} onDragOver={onDragOver(i)} onDragEnd={onDragEnd}>
              <div className="cia-ext-ca-widget-head">
                <span className="cia-ext-ca-widget-grip" title="Drag to reorder">⠿</span>
                {isLayout ? <span className="cia-ext-ca-widget-type-label">{meta?.label}</span> : <input className="cia-ext-ca-widget-title" value={w.data.title ?? meta?.label ?? w.type} onChange={(e) => updateWidget(i, { ...w.data, title: e.target.value })} />}
                <div className="cia-ext-ca-widget-actions">
                  <button onClick={() => duplicateWidget(i)} title="Duplicate">⧉</button>
                  <button onClick={() => removeWidget(i)} title="Remove">×</button>
                </div>
              </div>
              {Comp && <Comp data={w.data} onChange={(d) => updateWidget(i, d)} editMode />}
            </div>
          );
        })}
      </div>

      {addingWidget ? (
        <div className="cia-ext-ca-widget-picker">
          <div className="cia-ext-ca-picker-head"><span className="cia-ext-ca-section-label">Add a widget</span><button className="cia-ext-ca-cancel-btn" onClick={() => setAddingWidget(false)}>Cancel</button></div>
          <div className="cia-ext-ca-picker-cats">
            <button className={`cia-ext-ca-picker-cat${pickerCat === "all" ? " is-active" : ""}`} onClick={() => setPickerCat("all")}>All</button>
            {WIDGET_CATEGORIES.map((c) => (<button key={c.id} className={`cia-ext-ca-picker-cat${pickerCat === c.id ? " is-active" : ""}`} onClick={() => setPickerCat(c.id)}>{c.label}</button>))}
          </div>
          <div className="cia-ext-ca-widget-grid">{filtered.map((wt) => (<button key={wt.type} className="cia-ext-ca-widget-option" onClick={() => addWidget(wt)}><strong>{wt.label}</strong><small>{wt.desc}</small></button>))}</div>
        </div>
      ) : (
        <button className="cia-ext-ca-add-widget-btn" onClick={() => { setAddingWidget(true); setPickerCat("all"); }}>Add widget</button>
      )}

      <div className="cia-ext-ca-editor-footer">
        <button className="cia-ext-ca-cancel-btn" onClick={onCancel}>Cancel</button>
        <button className="cia-ext-ca-save-btn" disabled={!valid} onClick={() => onSave({ id: app?.id ?? crypto.randomUUID(), name: name.trim(), icon, desc: desc.trim(), color, widgets })}>{app ? "Save changes" : "Create app"}</button>
      </div>
    </div>
  );
}

// ── App runner ─────────────────────────────────────────────────────────────
export function AppRunner({ app, onChange, onBack, onEdit }) {
  const updateWidget = (i, data) => onChange({ ...app, widgets: app.widgets.map((w, j) => (j === i ? { ...w, data } : w)) });
  useEffect(() => { app.widgets.forEach((w) => { if (w.type === "scripter" && w.data.autoRun) { try { new Function(w.data.code ?? "")(); } catch { /* */ } } }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="cia-ext-ca-runner">
      <div className="cia-ext-ca-runner-header">
        <button className="cia-ext-ca-back-btn" onClick={onBack}>Back</button>
        <span className="cia-ext-ca-runner-title">{app.icon} {app.name}</span>
        <button className="cia-ext-ca-edit-inline" onClick={onEdit}>Edit</button>
      </div>
      {app.desc && <div className="cia-ext-ca-runner-desc">{app.desc}</div>}
      <div className="cia-ext-ca-runner-widgets">
        {app.widgets.map((w, i) => {
          const Comp = WIDGET_MAP[w.type];
          if (w.type === "header" || w.type === "divider") return <div key={w.id}>{Comp && <Comp data={w.data} onChange={(d) => updateWidget(i, d)} editMode={false} />}</div>;
          return (
            <div key={w.id} className="cia-ext-ca-widget-card">
              <div className="cia-ext-ca-widget-head"><span className="cia-ext-ca-widget-title-static">{w.data.title ?? w.type}</span></div>
              {Comp && <Comp data={w.data} onChange={(d) => updateWidget(i, d)} editMode={false} />}
            </div>
          );
        })}
      </div>
      {app.widgets.length === 0 && <div className="cia-ext-ca-empty">This app has no widgets. Edit it to add some.</div>}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────
export function AppCreatorPanel({ onClose }) {
  const [apps, setApps] = useState([]);
  const [mode, setMode] = useState("list");
  const [activeApp, setActiveApp] = useState(null);
  useEffect(() => { loadApps().then(setApps); }, []);
  const persist = useCallback((next) => { setApps(next); void saveApps(next); }, []);
  const handleSave = (app) => { const idx = apps.findIndex((a) => a.id === app.id); persist(idx >= 0 ? apps.map((a) => a.id === app.id ? app : a) : [...apps, app]); setMode("list"); setActiveApp(null); };
  const handleDelete = (id) => { persist(apps.filter((a) => a.id !== id)); if (activeApp?.id === id) { setMode("list"); setActiveApp(null); } };
  const handleDuplicate = (app) => { persist([...apps, { ...app, id: crypto.randomUUID(), name: `${app.name} (copy)`, widgets: app.widgets.map((w) => ({ ...w, id: crypto.randomUUID() })) }]); };
  const handleRunChange = (updated) => { persist(apps.map((a) => a.id === updated.id ? updated : a)); setActiveApp(updated); };

  if (mode === "create" || mode === "edit") return (<div className="cia-ext-settings-overlay cia-ext-ca-panel"><AppEditor app={mode === "edit" ? activeApp : null} onSave={handleSave} onCancel={() => { setMode("list"); setActiveApp(null); }} /></div>);
  if (mode === "run" && activeApp) return (<div className="cia-ext-settings-overlay cia-ext-ca-panel"><AppRunner app={activeApp} onChange={handleRunChange} onBack={() => { setMode("list"); setActiveApp(null); }} onEdit={() => setMode("edit")} /></div>);

  return (
    <div className="cia-ext-settings-overlay cia-ext-ca-panel">
      <div className="cia-ext-settings-header"><strong>App Creator</strong></div>
      <div className="cia-ext-ca-body">
        <div className="cia-ext-ca-intro">Build custom micro-apps from {WIDGET_TYPES.length} widget types — kanban boards, calculators, flashcards, budgets and more.</div>
        <button className="cia-ext-ca-create-btn" onClick={() => setMode("create")}>Create new app</button>
        {apps.length === 0 && <div className="cia-ext-ca-empty">No apps yet. Create one to get started.</div>}
        <div className="cia-ext-ca-app-list">
          {apps.map((app) => (
            <div key={app.id} className="cia-ext-ca-app-card" onClick={() => { setActiveApp(app); setMode("run"); }} style={app.color ? { borderLeftColor: app.color } : undefined}>
              <span className="cia-ext-ca-app-icon">{app.icon}</span>
              <div className="cia-ext-ca-app-info"><strong>{app.name}</strong>{app.desc && <small>{app.desc}</small>}<small className="cia-ext-ca-app-meta">{app.widgets.length} widget{app.widgets.length !== 1 ? "s" : ""}</small></div>
              <div className="cia-ext-ca-app-actions" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { setActiveApp(app); setMode("edit"); }}>Edit</button>
                <button onClick={() => handleDuplicate(app)}>Copy</button>
                <button className="cia-ext-ca-del" onClick={() => handleDelete(app.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

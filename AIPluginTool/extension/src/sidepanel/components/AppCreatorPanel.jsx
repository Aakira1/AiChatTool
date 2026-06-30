import { useCallback, useEffect, useRef, useState } from "react";
import { getStored, setStored } from "../../lib/storage.js";
import { getActiveProvider, streamLlm } from "../../lib/aiProviders.js";
import { aiComplete } from "../../lib/api.js";

const STORAGE_KEY = "customApps";
const USAGE_KEY = "appCreatorUsage";
const MAX_USAGE_ENTRIES = 50;

// ── Usage learning: stores recent interactions so AI gains user-specific context
async function logUsage(entry) {
  try {
    const { [USAGE_KEY]: d } = await getStored([USAGE_KEY]);
    const list = Array.isArray(d) ? d : [];
    const next = [{ ...entry, ts: Date.now() }, ...list].slice(0, MAX_USAGE_ENTRIES);
    await setStored({ [USAGE_KEY]: next });
  } catch { /* non-fatal */ }
}

async function getUsageContext(widgetType, maxItems = 6) {
  try {
    const { [USAGE_KEY]: d } = await getStored([USAGE_KEY]);
    const list = Array.isArray(d) ? d : [];
    const sameType = list.filter((x) => x.widgetType === widgetType).slice(0, maxItems);
    const recent = list.slice(0, maxItems);
    const picks = [...new Map([...sameType, ...recent].map((x) => [x.ts, x])).values()].slice(0, maxItems);
    if (!picks.length) return "";
    const lines = picks.map((x) => `- [${x.widgetType}] ${x.summary}`).join("\n");
    return `Recent context from this user's prior work (use this to match their domain, terminology and style):\n${lines}`;
  } catch { return ""; }
}

// ── AI helper: BYO provider first, falls back to backend, with learned context
async function callAi(prompt, system, opts = {}) {
  const { widgetType, learn = true, summary } = opts;
  let sysWithCtx = system ?? "";
  if (learn && widgetType) {
    const ctx = await getUsageContext(widgetType);
    if (ctx) sysWithCtx = `${sysWithCtx}\n\n${ctx}`.trim();
  }
  let result = "";
  try {
    const provider = await getActiveProvider();
    if (provider) {
      const messages = sysWithCtx ? [{ role: "system", content: sysWithCtx }, { role: "user", content: prompt }] : [{ role: "user", content: prompt }];
      let full = "";
      await streamLlm({ provider, messages, onToken: (t) => { full += t; }, maxTokens: 4096 });
      result = full.trim();
    }
  } catch { /* fall through */ }
  if (!result) result = (await aiComplete({ message: sysWithCtx ? `${sysWithCtx}\n\n${prompt}` : prompt })).trim();
  if (learn && widgetType) void logUsage({ widgetType, summary: summary ?? prompt.slice(0, 140) });
  return result;
}

// ── Sandboxed JS runner (bypasses extension CSP via iframe sandbox) ────────
function runSandboxed(code) {
  return new Promise((resolve) => {
    const id = `sb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const html = `<!DOCTYPE html><html><head></head><body><script>
      const __logs = [];
      const __wrap = (k) => (...a) => __logs.push("[" + k + "] " + a.map(v => { try { return typeof v === "object" ? JSON.stringify(v) : String(v); } catch { return String(v); } }).join(" "));
      const console = { log: __wrap("log"), info: __wrap("info"), warn: __wrap("warn"), error: __wrap("error") };
      let __ret;
      try {
        __ret = (function(){ ${code} })();
      } catch (e) {
        parent.postMessage({ type: "sb", id: "${id}", ok: false, value: e.message, logs: __logs }, "*");
        throw 0;
      }
      const out = __ret === undefined ? (__logs.length ? "" : "(no return value)") : (typeof __ret === "object" ? JSON.stringify(__ret, null, 2) : String(__ret));
      parent.postMessage({ type: "sb", id: "${id}", ok: true, value: out, logs: __logs }, "*");
    <\/script></body></html>`;
    const iframe = document.createElement("iframe");
    iframe.sandbox = "allow-scripts";
    iframe.style.display = "none";
    iframe.srcdoc = html;
    let done = false;
    const cleanup = () => { if (done) return; done = true; window.removeEventListener("message", onMsg); try { iframe.remove(); } catch { /* noop */ } };
    const onMsg = (e) => {
      if (e.data?.type !== "sb" || e.data.id !== id) return;
      cleanup();
      resolve({ ok: e.data.ok, value: e.data.value, logs: e.data.logs ?? [] });
    };
    window.addEventListener("message", onMsg);
    document.body.appendChild(iframe);
    setTimeout(() => { if (!done) { cleanup(); resolve({ ok: false, value: "Timed out after 30s — code took too long to run", logs: [] }); } }, 30000);
  });
}

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
  { type: "json", label: "JSON Viewer", desc: "View and edit JSON data", category: "utility", defaults: { title: "JSON", text: '{\n  "key": "value"\n}' } },
  { type: "poll", label: "Poll", desc: "Quick voting widget", category: "utility", defaults: { title: "Poll", question: "Which option?", options: [{ text: "Option A", votes: 0 }, { text: "Option B", votes: 0 }] } },
  { type: "budget", label: "Budget", desc: "Simple income & expense tracker", category: "utility", defaults: { title: "Budget", entries: [{ label: "", amount: 0, type: "expense" }] } },
  { type: "scripter", label: "Code Scripter", desc: "Run code in 10 languages", category: "utility", defaults: { title: "Scripter", lang: "javascript", code: 'console.log("Hello!");\nreturn 1 + 2;', autoRun: false } },
  // AI
  { type: "ai_sql", label: "SQL Generator", desc: "AI writes SQL from natural language", category: "ai", defaults: { title: "SQL Generator", dialect: "PostgreSQL", request: "", result: "" } },
  { type: "ai_writer", label: "AI Writer", desc: "Generate text in any style", category: "ai", defaults: { title: "AI Writer", style: "Professional email", prompt: "", result: "" } },
  { type: "ai_translate", label: "AI Translator", desc: "Translate to any language", category: "ai", defaults: { title: "Translator", target: "Spanish", source: "", result: "" } },
  { type: "ai_summary", label: "AI Summarizer", desc: "Summarize long text", category: "ai", defaults: { title: "Summarizer", source: "", style: "Bullet points", result: "" } },
  { type: "ai_brainstorm", label: "Brainstorm Buddy", desc: "Generate ideas on any topic", category: "ai", defaults: { title: "Brainstorm", topic: "", count: 5, result: "" } },
  { type: "ai_explain", label: "Explain Like I'm 5", desc: "Simplify any concept", category: "ai", defaults: { title: "Explain it", concept: "", level: "5-year-old", result: "" } },
  { type: "ai_regex", label: "Regex Builder", desc: "AI builds regex from description", category: "ai", defaults: { title: "Regex", request: "", result: "" } },
  { type: "ai_testscripts", label: "Test Script Generator", desc: "AI builds test cases in the standard template", category: "ai", defaults: { title: "Test Cases", module: "", moduleCode: "", subProcess: "", context: "", count: 8, rows: [], startingTestNum: 1 } },
];

const WIDGET_CATEGORIES = [
  { id: "ai", label: "AI" },
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
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState(0);
  const url = (data.url ?? "").trim();
  let hostname = ""; let valid = false;
  try { const u = new URL(url); hostname = u.hostname; valid = true; } catch { /* invalid */ }
  const reload = () => { setFailed(false); setKey((k) => k + 1); };
  const openTab = () => { if (chrome?.tabs?.create) chrome.tabs.create({ url }); else window.open(url, "_blank", "noopener"); };
  useEffect(() => { setFailed(false); }, [url, key]);
  // Many sites set X-Frame-Options/CSP and block embedding. Detect with a short timeout — if onLoad never fires, assume blocked.
  useEffect(() => {
    if (!valid) return;
    const t = setTimeout(() => setFailed((f) => f || true), 4500);
    return () => clearTimeout(t);
  }, [url, key, valid]);
  const favicon = valid ? `https://www.google.com/s2/favicons?sz=64&domain=${hostname}` : null;
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-embed">
      <div className="cia-ext-ca-embed-bar">
        <input className="cia-ext-ca-embed-url" value={data.url ?? ""} onChange={(e) => onChange({ ...data, url: e.target.value })} placeholder="https://example.com" />
        {valid && <button className="cia-ext-ca-embed-btn" onClick={openTab} title="Open in new tab">↗</button>}
      </div>
      {!valid ? (
        <div className="cia-ext-ca-empty"><span className="cia-ext-ca-empty-icon">🌐</span>Enter a URL above (must start with http:// or https://)</div>
      ) : failed ? (
        <div className="cia-ext-ca-embed-fallback">
          {favicon && <img src={favicon} alt="" className="cia-ext-ca-embed-favicon" />}
          <div className="cia-ext-ca-embed-host">{hostname}</div>
          <div className="cia-ext-ca-embed-msg">Can't embed this site — it blocks iframes for security. Use Open instead.</div>
          <div className="cia-ext-ca-embed-actions">
            <button className="cia-ext-ca-embed-open" onClick={openTab}>↗ Open {hostname}</button>
            <button className="cia-ext-ca-embed-retry" onClick={reload}>Retry</button>
          </div>
          <small className="cia-ext-ca-embed-tip">Sites that <em>do</em> embed: YouTube, CodePen, Google Docs (preview links), Figma (embed URLs).</small>
        </div>
      ) : (
        <iframe key={key} src={url} title={data.title} onLoad={() => setFailed(false)} style={{ width: "100%", height: data.height ?? 320, border: "1px solid var(--cia-border)", borderRadius: 8, background: "#fff" }} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerPolicy="no-referrer" />
      )}
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

// Small safe expression evaluator: supports + - * / ( ) decimal numbers and unary minus.
function safeEvalArith(input) {
  const s = String(input).replace(/\s+/g, "");
  if (!/^[-+/*().0-9]+$/.test(s)) throw new Error("invalid");
  let i = 0;
  const peek = () => s[i];
  const eat = (c) => { if (s[i] !== c) throw new Error("syntax"); i++; };
  const parseNumber = () => {
    let n = "";
    while (i < s.length && /[0-9.]/.test(s[i])) { n += s[i++]; }
    if (!n) throw new Error("number");
    return parseFloat(n);
  };
  const parseFactor = () => {
    if (peek() === "(") { eat("("); const v = parseExpr(); eat(")"); return v; }
    if (peek() === "-") { eat("-"); return -parseFactor(); }
    if (peek() === "+") { eat("+"); return parseFactor(); }
    return parseNumber();
  };
  const parseTerm = () => {
    let v = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = s[i++];
      const r = parseFactor();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  function parseExpr() {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = s[i++];
      const r = parseTerm();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  const result = parseExpr();
  if (i !== s.length) throw new Error("trailing");
  return result;
}

function CalculatorWidget() {
  const [display, setDisplay] = useState("0");
  const [expr, setExpr] = useState("");
  const press = (v) => {
    if (v === "C") { setDisplay("0"); setExpr(""); return; }
    if (v === "⌫") { setDisplay((d) => d.length > 1 ? d.slice(0, -1) : "0"); setExpr((e) => e.slice(0, -1)); return; }
    if (v === "=") { try { const r = safeEvalArith(expr); setDisplay(String(r)); setExpr(String(r)); } catch { setDisplay("Error"); } return; }
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

const SCRIPTER_LANGS = [
  { id: "javascript", label: "JavaScript", placeholder: 'console.log("Hello!");\nreturn 1 + 2;', native: true },
  { id: "python", label: "Python", placeholder: 'print("Hello!")\nresult = 1 + 2\nprint(result)' },
  { id: "sql", label: "SQL", placeholder: "SELECT name, COUNT(*)\nFROM users\nGROUP BY name;" },
  { id: "bash", label: "Bash", placeholder: 'echo "Hello"\nls -la' },
  { id: "html", label: "HTML", placeholder: '<h1>Hello</h1>\n<p>World</p>', preview: true },
  { id: "typescript", label: "TypeScript", placeholder: 'const x: number = 42;\nconsole.log(x);' },
  { id: "ruby", label: "Ruby", placeholder: 'puts "Hello"\np 1 + 2' },
  { id: "go", label: "Go", placeholder: 'fmt.Println("Hello")' },
  { id: "rust", label: "Rust", placeholder: 'println!("Hello");' },
  { id: "json", label: "JSON", placeholder: '{ "hello": "world" }' },
];

function ScripterWidget({ data, onChange }) {
  const [output, setOutput] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const lang = SCRIPTER_LANGS.find((l) => l.id === (data.lang ?? "javascript")) ?? SCRIPTER_LANGS[0];

  const run = async () => {
    setError(null); setOutput(null); setLogs([]); setRunning(true);
    const code = data.code ?? "";
    try {
      if (lang.id === "javascript" || lang.id === "typescript") {
        const r = await runSandboxed(code);
        if (r.ok) { setOutput(r.value); setLogs(r.logs); }
        else { setError(r.value); setLogs(r.logs); }
      } else if (lang.id === "json") {
        try { setOutput(JSON.stringify(JSON.parse(code), null, 2)); }
        catch (e) { setError(`Invalid JSON: ${e.message}`); }
      } else if (lang.id === "html") {
        // preview happens inline below; nothing to "run"
        setOutput("");
      } else {
        // For non-native languages, use AI as a runner — it simulates execution.
        const sys = `You are a ${lang.label} interpreter. Execute the user's code mentally and reply ONLY with what the program would print to stdout. If the program would error, reply with the error message. No commentary, no markdown fences, no labels — just the literal output.`;
        const out = await callAi(code, sys, { widgetType: "scripter", summary: `${lang.label}: ${code.slice(0, 80)}` });
        setOutput(out);
      }
    } catch (e) { setError(e.message); }
    finally { setRunning(false); }
  };

  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-scripter">
      <div className="cia-ext-ca-scripter-langbar">
        <select className="cia-ext-ca-scripter-lang" value={lang.id} onChange={(e) => onChange({ ...data, lang: e.target.value })}>
          {SCRIPTER_LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}{!l.native && !l.preview && l.id !== "json" ? " · AI" : ""}</option>)}
        </select>
        {!lang.native && lang.id !== "html" && lang.id !== "json" && <span className="cia-ext-ca-scripter-hint">✨ AI simulates output</span>}
        {lang.native && <span className="cia-ext-ca-scripter-hint">Sandboxed · 30s limit</span>}
      </div>
      <textarea className="cia-ext-ca-scripter-code" value={data.code ?? ""} onChange={(e) => onChange({ ...data, code: e.target.value })} placeholder={lang.placeholder} rows={7} spellCheck={false} />
      <div className="cia-ext-ca-scripter-bar">
        <button className="cia-ext-ca-run-btn" onClick={run} disabled={running}>{running ? "Running…" : lang.id === "html" ? "Refresh preview" : "▶ Run"}</button>
        {lang.native && <label className="cia-ext-ca-scripter-auto"><input type="checkbox" checked={data.autoRun ?? false} onChange={(e) => onChange({ ...data, autoRun: e.target.checked })} />Auto-run</label>}
      </div>
      {lang.id === "html" && (data.code ?? "").trim() && (
        <iframe className="cia-ext-ca-scripter-preview" sandbox="allow-scripts" srcDoc={`<!DOCTYPE html><html><head><style>body{font-family:system-ui,sans-serif;padding:12px;margin:0}</style></head><body>${data.code}</body></html>`} title="HTML preview" />
      )}
      {logs.length > 0 && <pre className="cia-ext-ca-scripter-logs">{logs.join("\n")}</pre>}
      {output !== null && output !== "" && <pre className="cia-ext-ca-scripter-output">→ {output}</pre>}
      {error && <pre className="cia-ext-ca-scripter-error">⚠ {error}</pre>}
    </div>
  );
}

// ── AI Widgets ──────────────────────────────────────────────────────────────
function AiRunButton({ onClick, running, label = "Generate" }) {
  return <button className="cia-ext-ca-ai-run" onClick={onClick} disabled={running}>{running ? <><span className="cia-ext-ca-ai-spinner" />Thinking…</> : <>✨ {label}</>}</button>;
}

function AiResult({ result, onClear }) {
  if (!result) return null;
  return (
    <div className="cia-ext-ca-ai-result">
      <pre className="cia-ext-ca-ai-result-text">{result}</pre>
      <div className="cia-ext-ca-ai-result-bar">
        <button onClick={() => navigator.clipboard?.writeText(result)}>Copy</button>
        <button onClick={onClear}>Clear</button>
      </div>
    </div>
  );
}

function SqlGeneratorWidget({ data, onChange }) {
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState(null);
  const run = async () => {
    if (!data.request?.trim()) return;
    setRunning(true); setErr(null);
    try {
      const sys = `You are a SQL expert. Write a single ${data.dialect ?? "SQL"} query. Reply with ONLY the SQL — no markdown fences, no explanation. Use plausible table/column names if not specified.`;
      const r = await callAi(data.request, sys, { widgetType: "ai_sql", summary: data.request });
      onChange({ ...data, result: r.replace(/^```(?:sql)?\n?|```$/g, "").trim() });
    } catch (e) { setErr(e.message); }
    finally { setRunning(false); }
  };
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-ai">
      <div className="cia-ext-ca-ai-row">
        <label className="cia-ext-ca-ai-label">Dialect</label>
        <select value={data.dialect ?? "PostgreSQL"} onChange={(e) => onChange({ ...data, dialect: e.target.value })} className="cia-ext-ca-ai-select">
          {["PostgreSQL", "MySQL", "SQLite", "MS SQL Server", "Oracle", "BigQuery", "Snowflake"].map((d) => <option key={d}>{d}</option>)}
        </select>
      </div>
      <label className="cia-ext-ca-ai-label">What do you want?</label>
      <textarea className="cia-ext-ca-ai-text" rows={3} value={data.request ?? ""} onChange={(e) => onChange({ ...data, request: e.target.value })} placeholder="e.g. Top 10 users by signups this month, joined with their last login" />
      <AiRunButton onClick={run} running={running} label="Generate SQL" />
      {err && <div className="cia-ext-ca-ai-err">{err}</div>}
      <AiResult result={data.result} onClear={() => onChange({ ...data, result: "" })} />
    </div>
  );
}

function AiWriterWidget({ data, onChange }) {
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState(null);
  const run = async () => {
    if (!data.prompt?.trim()) return;
    setRunning(true); setErr(null);
    try {
      const r = await callAi(`Write in this style: ${data.style}\n\n${data.prompt}`, "You are a versatile writer. Produce well-crafted text matching the requested style.", { widgetType: "ai_writer", summary: `${data.style}: ${data.prompt}` });
      onChange({ ...data, result: r });
    } catch (e) { setErr(e.message); }
    finally { setRunning(false); }
  };
  const styles = ["Professional email", "Casual message", "Tweet", "LinkedIn post", "Blog intro", "Marketing copy", "Poem", "Apology", "Thank-you note"];
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-ai">
      <label className="cia-ext-ca-ai-label">Style</label>
      <select value={data.style ?? styles[0]} onChange={(e) => onChange({ ...data, style: e.target.value })} className="cia-ext-ca-ai-select">{styles.map((s) => <option key={s}>{s}</option>)}</select>
      <label className="cia-ext-ca-ai-label">What about?</label>
      <textarea className="cia-ext-ca-ai-text" rows={3} value={data.prompt ?? ""} onChange={(e) => onChange({ ...data, prompt: e.target.value })} placeholder="e.g. Ask my manager for a day off next Friday" />
      <AiRunButton onClick={run} running={running} label="Write" />
      {err && <div className="cia-ext-ca-ai-err">{err}</div>}
      <AiResult result={data.result} onClear={() => onChange({ ...data, result: "" })} />
    </div>
  );
}

function AiTranslateWidget({ data, onChange }) {
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState(null);
  const run = async () => {
    if (!data.source?.trim()) return;
    setRunning(true); setErr(null);
    try {
      const r = await callAi(data.source, `Translate the user's text to ${data.target}. Reply with ONLY the translation — no quotes, no explanation.`, { widgetType: "ai_translate", summary: `→${data.target}: ${data.source.slice(0, 80)}` });
      onChange({ ...data, result: r });
    } catch (e) { setErr(e.message); }
    finally { setRunning(false); }
  };
  const langs = ["Spanish", "French", "German", "Italian", "Portuguese", "Dutch", "Japanese", "Mandarin Chinese", "Korean", "Arabic", "Russian", "Hindi", "English"];
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-ai">
      <label className="cia-ext-ca-ai-label">Translate to</label>
      <select value={data.target ?? langs[0]} onChange={(e) => onChange({ ...data, target: e.target.value })} className="cia-ext-ca-ai-select">{langs.map((l) => <option key={l}>{l}</option>)}</select>
      <textarea className="cia-ext-ca-ai-text" rows={3} value={data.source ?? ""} onChange={(e) => onChange({ ...data, source: e.target.value })} placeholder="Text to translate…" />
      <AiRunButton onClick={run} running={running} label="Translate" />
      {err && <div className="cia-ext-ca-ai-err">{err}</div>}
      <AiResult result={data.result} onClear={() => onChange({ ...data, result: "" })} />
    </div>
  );
}

function AiSummaryWidget({ data, onChange }) {
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState(null);
  const run = async () => {
    if (!data.source?.trim()) return;
    setRunning(true); setErr(null);
    try {
      const r = await callAi(data.source, `Summarize the user's text as ${data.style}. Be concise and faithful.`, { widgetType: "ai_summary", summary: `${data.style}: ${data.source.slice(0, 80)}` });
      onChange({ ...data, result: r });
    } catch (e) { setErr(e.message); }
    finally { setRunning(false); }
  };
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-ai">
      <label className="cia-ext-ca-ai-label">Style</label>
      <select value={data.style ?? "Bullet points"} onChange={(e) => onChange({ ...data, style: e.target.value })} className="cia-ext-ca-ai-select">{["Bullet points", "One sentence", "Paragraph", "Key takeaways", "TL;DR"].map((s) => <option key={s}>{s}</option>)}</select>
      <textarea className="cia-ext-ca-ai-text" rows={5} value={data.source ?? ""} onChange={(e) => onChange({ ...data, source: e.target.value })} placeholder="Paste text to summarize…" />
      <AiRunButton onClick={run} running={running} label="Summarize" />
      {err && <div className="cia-ext-ca-ai-err">{err}</div>}
      <AiResult result={data.result} onClear={() => onChange({ ...data, result: "" })} />
    </div>
  );
}

function AiBrainstormWidget({ data, onChange }) {
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState(null);
  const run = async () => {
    if (!data.topic?.trim()) return;
    setRunning(true); setErr(null);
    try {
      const r = await callAi(`Topic: ${data.topic}\nGenerate ${data.count ?? 5} distinct, creative ideas. Number them.`, "You are a creative brainstorming partner.", { widgetType: "ai_brainstorm", summary: data.topic });
      onChange({ ...data, result: r });
    } catch (e) { setErr(e.message); }
    finally { setRunning(false); }
  };
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-ai">
      <div className="cia-ext-ca-ai-row">
        <label className="cia-ext-ca-ai-label">Ideas</label>
        <input type="number" min={1} max={20} value={data.count ?? 5} onChange={(e) => onChange({ ...data, count: Number(e.target.value) })} className="cia-ext-ca-ai-num" />
      </div>
      <label className="cia-ext-ca-ai-label">Topic</label>
      <textarea className="cia-ext-ca-ai-text" rows={2} value={data.topic ?? ""} onChange={(e) => onChange({ ...data, topic: e.target.value })} placeholder="e.g. Names for a coffee shop" />
      <AiRunButton onClick={run} running={running} label="Brainstorm" />
      {err && <div className="cia-ext-ca-ai-err">{err}</div>}
      <AiResult result={data.result} onClear={() => onChange({ ...data, result: "" })} />
    </div>
  );
}

function AiExplainWidget({ data, onChange }) {
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState(null);
  const run = async () => {
    if (!data.concept?.trim()) return;
    setRunning(true); setErr(null);
    try {
      const r = await callAi(`Explain "${data.concept}" to a ${data.level}. Use simple words and a short analogy.`, "", { widgetType: "ai_explain", summary: data.concept });
      onChange({ ...data, result: r });
    } catch (e) { setErr(e.message); }
    finally { setRunning(false); }
  };
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-ai">
      <label className="cia-ext-ca-ai-label">Audience</label>
      <select value={data.level ?? "5-year-old"} onChange={(e) => onChange({ ...data, level: e.target.value })} className="cia-ext-ca-ai-select">{["5-year-old", "high schooler", "college student", "expert in a different field"].map((s) => <option key={s}>{s}</option>)}</select>
      <label className="cia-ext-ca-ai-label">Concept</label>
      <textarea className="cia-ext-ca-ai-text" rows={2} value={data.concept ?? ""} onChange={(e) => onChange({ ...data, concept: e.target.value })} placeholder="e.g. Quantum entanglement" />
      <AiRunButton onClick={run} running={running} label="Explain" />
      {err && <div className="cia-ext-ca-ai-err">{err}</div>}
      <AiResult result={data.result} onClear={() => onChange({ ...data, result: "" })} />
    </div>
  );
}

function AiRegexWidget({ data, onChange }) {
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState(null);
  const run = async () => {
    if (!data.request?.trim()) return;
    setRunning(true); setErr(null);
    try {
      const r = await callAi(data.request, "You are a regex expert. Reply with the regex pattern, then on a new line a short explanation. No markdown fences.", { widgetType: "ai_regex", summary: data.request });
      onChange({ ...data, result: r });
    } catch (e) { setErr(e.message); }
    finally { setRunning(false); }
  };
  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-ai">
      <label className="cia-ext-ca-ai-label">Describe the pattern</label>
      <textarea className="cia-ext-ca-ai-text" rows={2} value={data.request ?? ""} onChange={(e) => onChange({ ...data, request: e.target.value })} placeholder="e.g. Match Australian phone numbers" />
      <AiRunButton onClick={run} running={running} label="Build regex" />
      {err && <div className="cia-ext-ca-ai-err">{err}</div>}
      <AiResult result={data.result} onClear={() => onChange({ ...data, result: "" })} />
    </div>
  );
}

// ── Test Script Generator ─────────────────────────────────────────────────
// Follows the standard "Test Cases Template" structure:
// Business Process | # | Sub-Process | Test # | Test | Prerequisite | Expected Outcome | Data | Result | If Failed - Issue # | Retest Result | Notes/Actions
const TS_COLUMNS = ["Business Process", "#", "Sub-Process", "Test #", "Test", "Prerequisite", "Expected Outcome", "Data", "Result", "If Failed - Issue #", "Retest Result", "Notes/Actions"];
const TS_RESULTS = ["Not Complete", "Pass", "Fail", "Blocked", "N/A"];

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function TestScriptsWidget({ data, onChange }) {
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState(null);
  const rows = Array.isArray(data.rows) ? data.rows : [];

  const generate = async () => {
    if (!data.module?.trim()) { setErr("Set a Business Process (e.g. Debtors)."); return; }
    setRunning(true); setErr(null);
    try {
      const code = (data.moduleCode || data.module.replace(/[^A-Z]/gi, "").slice(0, 3).toUpperCase() || "MOD").trim();
      const startNum = Number(data.startingTestNum) || (rows.length ? Math.max(...rows.map((r) => Number(String(r[3]).split(".").pop()) || 0)) + 1 : 1);
      const sys = [
        "You generate software test cases that follow a strict CSV template.",
        "Output ONLY a JSON array of objects — no markdown, no commentary.",
        "Each object must have these EXACT keys:",
        '"businessProcess","subProcessCode","subProcess","testNumber","test","prerequisite","expectedOutcome","data"',
        "Conventions (match the customer's house style):",
        `- businessProcess: "${data.module}" on the first row of each Sub-Process group, blank on continuation rows.`,
        `- subProcessCode: short code like "${code}1", "${code}2", etc. — increments per Sub-Process. Blank on continuation rows.`,
        `- subProcess: name of the sub-process (e.g. "Debtor Navigation"). Blank on continuation rows.`,
        `- testNumber: "${code}<group>.<n>" e.g. "${code}1.1", "${code}1.2", "${code}2.1".`,
        `- test: a first-person user statement like "I can …" or "I am able to …".`,
        `- prerequisite: a prior test number it depends on (e.g. "${code}1.1") or a high-level requirement like "User account".`,
        `- expectedOutcome: short, concrete pass criterion ("Able to …").`,
        `- data: keep blank unless specific test data is essential.`,
        "Generate realistic, non-overlapping test cases that cover happy paths, edge cases, permissions and reporting.",
      ].join("\n");
      const userMsg = [
        `Business Process: ${data.module}`,
        `Module code: ${code}`,
        `Starting test number for this batch: ${code}<group>.${startNum}`,
        data.subProcess ? `Focus sub-process(es): ${data.subProcess}` : null,
        `How many test cases to generate: ${data.count ?? 8}`,
        data.context ? `Extra context / requirements:\n${data.context}` : null,
      ].filter(Boolean).join("\n");
      const raw = await callAi(userMsg, sys, { widgetType: "ai_testscripts", summary: `${data.module} (${data.count})` });
      // Extract JSON array even if model wrapped it
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("AI did not return a JSON array");
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) throw new Error("Expected an array");
      const newRows = parsed.map((p) => [
        p.businessProcess ?? "",
        p.subProcessCode ?? "",
        p.subProcess ?? "",
        p.testNumber ?? "",
        p.test ?? "",
        p.prerequisite ?? "",
        p.expectedOutcome ?? "",
        p.data ?? "",
        "Not Complete",
        "",
        "Not Complete",
        "",
      ]);
      onChange({ ...data, rows: [...rows, ...newRows] });
    } catch (e) { setErr(e.message); }
    finally { setRunning(false); }
  };

  const updateCell = (ri, ci, v) => {
    const next = rows.map((r, i) => i === ri ? r.map((c, j) => (j === ci ? v : c)) : r);
    onChange({ ...data, rows: next });
  };
  const addRow = () => onChange({ ...data, rows: [...rows, ["", "", "", "", "", "", "", "", "Not Complete", "", "Not Complete", ""]] });
  const removeRow = (i) => onChange({ ...data, rows: rows.filter((_, j) => j !== i) });
  const clearAll = () => onChange({ ...data, rows: [] });

  const exportCsv = () => {
    const header = ["Business Process", "#", "Sub-Process", "Test #", "Test", "Prerequisite", "Expected Outcome", "Data", "Result", "If Failed - Issue #", "Retest Result", "Notes/Actions"];
    const csv = [header.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${data.module || "test-cases"}-test-cases.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const passCount = rows.filter((r) => r[8] === "Pass").length;
  const failCount = rows.filter((r) => r[8] === "Fail").length;
  const total = rows.length;
  const pct = total > 0 ? Math.round((passCount / total) * 100) : 0;

  return (
    <div className="cia-ext-ca-widget-body cia-ext-ca-ts">
      <div className="cia-ext-ca-ts-config">
        <div className="cia-ext-ca-ts-row">
          <div className="cia-ext-ca-ts-field" style={{ flex: 2 }}>
            <label className="cia-ext-ca-ai-label">Business Process</label>
            <input className="cia-ext-ca-ai-text" value={data.module ?? ""} onChange={(e) => onChange({ ...data, module: e.target.value })} placeholder="e.g. Debtors, Creditors, GL" style={{ minHeight: 0 }} />
          </div>
          <div className="cia-ext-ca-ts-field" style={{ width: 76 }}>
            <label className="cia-ext-ca-ai-label">Code</label>
            <input className="cia-ext-ca-ai-text" value={data.moduleCode ?? ""} onChange={(e) => onChange({ ...data, moduleCode: e.target.value.toUpperCase().slice(0, 4) })} placeholder="DB" style={{ minHeight: 0, textTransform: "uppercase" }} maxLength={4} />
          </div>
          <div className="cia-ext-ca-ts-field" style={{ width: 70 }}>
            <label className="cia-ext-ca-ai-label">Cases</label>
            <input type="number" min={1} max={30} className="cia-ext-ca-ai-num" value={data.count ?? 8} onChange={(e) => onChange({ ...data, count: Number(e.target.value) })} style={{ width: "100%" }} />
          </div>
        </div>
        <div className="cia-ext-ca-ts-field">
          <label className="cia-ext-ca-ai-label">Focus sub-process(es) — optional</label>
          <input className="cia-ext-ca-ai-text" value={data.subProcess ?? ""} onChange={(e) => onChange({ ...data, subProcess: e.target.value })} placeholder="e.g. Invoice creation, Payment plans" style={{ minHeight: 0 }} />
        </div>
        <div className="cia-ext-ca-ts-field">
          <label className="cia-ext-ca-ai-label">Extra context — optional</label>
          <textarea className="cia-ext-ca-ai-text" rows={2} value={data.context ?? ""} onChange={(e) => onChange({ ...data, context: e.target.value })} placeholder="Council policies, integrations, edge cases the AI should cover…" />
        </div>
        <div className="cia-ext-ca-ts-actions">
          <AiRunButton onClick={generate} running={running} label={rows.length ? "Generate more" : "Generate test cases"} />
          {rows.length > 0 && (
            <>
              <button className="cia-ext-ca-ts-secondary" onClick={addRow}>+ Row</button>
              <button className="cia-ext-ca-ts-secondary" onClick={exportCsv}>⬇ CSV</button>
              <button className="cia-ext-ca-ts-secondary cia-ext-ca-ts-danger" onClick={clearAll}>Clear</button>
            </>
          )}
        </div>
        {err && <div className="cia-ext-ca-ai-err">{err}</div>}
      </div>

      {total > 0 && (
        <div className="cia-ext-ca-ts-progress">
          <div className="cia-ext-ca-ts-progress-bar">
            <div className="cia-ext-ca-ts-progress-pass" style={{ width: `${(passCount / total) * 100}%` }} />
            <div className="cia-ext-ca-ts-progress-fail" style={{ width: `${(failCount / total) * 100}%`, left: `${(passCount / total) * 100}%` }} />
          </div>
          <div className="cia-ext-ca-ts-progress-meta">
            <span className="cia-ext-ca-ts-stat is-pass">✓ {passCount} pass</span>
            <span className="cia-ext-ca-ts-stat is-fail">✗ {failCount} fail</span>
            <span className="cia-ext-ca-ts-stat">{total} total · {pct}%</span>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="cia-ext-ca-ts-table-wrap">
          <table className="cia-ext-ca-ts-table">
            <thead>
              <tr>
                {TS_COLUMNS.map((c) => <th key={c}>{c}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className={r[8] === "Pass" ? "is-pass" : r[8] === "Fail" ? "is-fail" : ""}>
                  {r.map((c, ci) => (
                    <td key={ci}>
                      {ci === 8 || ci === 10 ? (
                        <select value={c} onChange={(e) => updateCell(ri, ci, e.target.value)} className="cia-ext-ca-ts-cell-select">
                          {TS_RESULTS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <textarea value={c} onChange={(e) => updateCell(ri, ci, e.target.value)} className="cia-ext-ca-ts-cell" rows={1} />
                      )}
                    </td>
                  ))}
                  <td><button className="cia-ext-ca-remove-sm" onClick={() => removeRow(ri)} title="Remove row">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
  json: JsonWidget,
  poll: PollWidget, budget: BudgetWidget, scripter: ScripterWidget,
  ai_sql: SqlGeneratorWidget, ai_writer: AiWriterWidget, ai_translate: AiTranslateWidget,
  ai_summary: AiSummaryWidget, ai_brainstorm: AiBrainstormWidget,
  ai_explain: AiExplainWidget, ai_regex: AiRegexWidget, ai_testscripts: TestScriptsWidget,
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

// ── Milanote-style free board ──────────────────────────────────────────────
// Position model per widget: pos = { x, y, w, h } in world pixels. The board is
// an infinite pannable / zoomable surface; cards float on it.
const SNAP = 8;
const snap = (n) => Math.round(n / SNAP) * SNAP;
function defaultFreePos(index) {
  return { x: snap(24 + (index % 2) * 296), y: snap(24 + Math.floor(index / 2) * 236), w: 272, h: 208 };
}
// Treat old percentage-based positions (tiny w) as legacy → reseed to px grid.
const isLegacyPos = (p) => !p || typeof p.w !== "number" || p.w <= 130;
function seedFreePositions(widgets) {
  return widgets.map((w, i) => (isLegacyPos(w.pos) ? { ...w, pos: defaultFreePos(i) } : w));
}
function posOf(w, i) {
  return isLegacyPos(w.pos) ? defaultFreePos(i) : w.pos;
}

function FreeBoard({ widgets, editable, onMovePos, onAdd, renderCard, full }) {
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const [drag, setDrag] = useState(null);   // card move / resize
  const [pan, setPan] = useState(null);     // empty-space pan
  const viewRef = useRef(view);
  viewRef.current = view;

  const startCard = (id, mode) => (e) => {
    if (!editable) return;
    e.preventDefault(); e.stopPropagation();
    const w = widgets.find((x) => x.id === id);
    setDrag({ id, mode, startX: e.clientX, startY: e.clientY, orig: posOf(w, 0) });
  };
  const startPan = (e) => {
    if (e.target !== e.currentTarget) return; // only when grabbing empty board
    setPan({ startX: e.clientX, startY: e.clientY, orig: { x: view.x, y: view.y } });
  };

  useEffect(() => {
    if (!drag) return undefined;
    const move = (e) => {
      const z = viewRef.current.z;
      const dx = (e.clientX - drag.startX) / z;
      const dy = (e.clientY - drag.startY) / z;
      if (drag.mode === "move") {
        onMovePos(drag.id, { ...drag.orig, x: snap(drag.orig.x + dx), y: snap(drag.orig.y + dy) });
      } else {
        onMovePos(drag.id, { ...drag.orig, w: Math.max(150, snap(drag.orig.w + dx)), h: Math.max(96, snap(drag.orig.h + dy)) });
      }
    };
    const up = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag, onMovePos]);

  useEffect(() => {
    if (!pan) return undefined;
    const move = (e) => setView((v) => ({ ...v, x: pan.orig.x + (e.clientX - pan.startX), y: pan.orig.y + (e.clientY - pan.startY) }));
    const up = () => setPan(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [pan]);

  const zoomBy = (f) => setView((v) => ({ ...v, z: Math.min(2, Math.max(0.3, Math.round(v.z * f * 100) / 100)) }));
  const reset = () => setView({ x: 0, y: 0, z: 1 });

  // Scroll wheel pans the board (Milanote-style); shift makes it horizontal.
  // Native non-passive listener so preventDefault stops the panel from scrolling.
  const boardRef = useRef(null);
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      // Some browsers already map shift+wheel onto deltaX, others keep it on
      // deltaY — pick whichever is non-zero so horizontal panning always works.
      if (e.shiftKey) {
        const dx = e.deltaX || e.deltaY;
        setView((v) => ({ ...v, x: v.x - dx }));
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div ref={boardRef} className={`cia-ext-ca-board${pan ? " is-panning" : ""}${editable ? " is-editable" : ""}${full ? " is-full" : ""}`}>
      <div className="cia-ext-ca-board-world" onPointerDown={startPan} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
        {widgets.map((w, i) => {
          const p = posOf(w, i);
          return (
            <div key={w.id} className={`cia-ext-ca-board-item${drag?.id === w.id ? " is-active" : ""}`} style={{ left: p.x, top: p.y, width: p.w, height: p.h }}>
              {renderCard(w, { onDragHandle: startCard(w.id, "move"), editable })}
              {editable && <div className="cia-ext-ca-board-resize" onPointerDown={startCard(w.id, "resize")} title="Resize" />}
            </div>
          );
        })}
      </div>

      <div className="cia-ext-ca-board-toolbar" onPointerDown={(e) => e.stopPropagation()}>
        <button onClick={() => zoomBy(0.9)} title="Zoom out">−</button>
        <button className="cia-ext-ca-board-zoom" onClick={reset} title="Reset view">{Math.round(view.z * 100)}%</button>
        <button onClick={() => zoomBy(1.1)} title="Zoom in">+</button>
        {editable && onAdd && <button className="cia-ext-ca-board-add" onClick={onAdd} title="Add a card">＋ Card</button>}
      </div>
      {editable && widgets.length === 0 && <div className="cia-ext-ca-board-hint">Drag empty space to pan · Ctrl+scroll to zoom · add cards and arrange them freely</div>}
    </div>
  );
}

// ── App editor ─────────────────────────────────────────────────────────────
function AppEditor({ app, onSave, onCancel }) {
  const [name, setName] = useState(app?.name ?? "");
  const [icon, setIcon] = useState(app?.icon ?? "📋");
  const [desc, setDesc] = useState(app?.desc ?? "");
  const [color, setColor] = useState(app?.color ?? "#7c3aed");
  const [layout, setLayout] = useState(app?.layout ?? "stack");
  const [widgets, setWidgets] = useState(() => (app?.layout === "free" ? seedFreePositions(app?.widgets ?? []) : (app?.widgets ?? [])));
  const [addingWidget, setAddingWidget] = useState(false);
  const [pickerCat, setPickerCat] = useState("all");

  const { dragging, onDragStart, onDragOver, onDragEnd } = useDragReorder(widgets, setWidgets);
  const updateWidget = (i, data) => setWidgets((ws) => ws.map((w, j) => (j === i ? { ...w, data } : w)));
  const removeWidget = (i) => setWidgets((ws) => ws.filter((_, j) => j !== i));
  const removeWidgetById = (id) => setWidgets((ws) => ws.filter((w) => w.id !== id));
  const duplicateWidget = (i) => setWidgets((ws) => { const w = { ...ws[i], id: crypto.randomUUID(), data: { ...ws[i].data } }; const next = [...ws]; next.splice(i + 1, 0, w); return next; });
  const addWidget = (wt) => {
    const w = { id: crypto.randomUUID(), type: wt.type, data: { ...wt.defaults } };
    if (layout === "free") w.pos = defaultFreePos(widgets.length);
    setWidgets([...widgets, w]);
    setAddingWidget(false);
  };
  const setWidgetPos = (id, pos) => setWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, pos } : w)));
  const updateWidgetById = (id, data) => setWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, data } : w)));
  // Switching layout: seed free positions when entering free mode.
  const changeLayout = (next) => {
    if (next === "free") setWidgets((ws) => seedFreePositions(ws));
    setLayout(next);
  };
  const valid = name.trim().length > 0;
  const isFree = layout === "free";
  const filtered = pickerCat === "all" ? WIDGET_TYPES : WIDGET_TYPES.filter((w) => w.category === pickerCat);

  return (
    <div className="cia-ext-ca-editor">
      <div className="cia-ext-ca-editor-hero">
        <div className="cia-ext-ca-editor-hero-icon" style={{ background: color }}>{icon}</div>
        <div className="cia-ext-ca-editor-hero-meta">
          <input className="cia-ext-ca-hero-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="App name" maxLength={40} />
          <input className="cia-ext-ca-hero-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What does this app do?" maxLength={80} />
        </div>
      </div>

      <div className="cia-ext-ca-card">
        <div className="cia-ext-ca-card-title">Appearance</div>
        <div className="cia-ext-ca-field"><label>Icon</label><div className="cia-ext-ca-emoji-row">{EMOJI_PICKS.map((e) => (<button key={e} className={`cia-ext-ca-emoji-btn${icon === e ? " is-active" : ""}`} onClick={() => setIcon(e)}>{e}</button>))}</div></div>
        <div className="cia-ext-ca-field"><label>Accent color</label><div className="cia-ext-ca-color-row"><input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="cia-ext-ca-color-pick" /><span className="cia-ext-ca-color-hex">{color.toUpperCase()}</span></div></div>
      </div>

      <div className="cia-ext-ca-card">
        <div className="cia-ext-ca-card-title">Layout</div>
        <div className="cia-ext-ca-layout-selector">
          {[
            { id: "stack", bars: [{ w: "100%" }], label: "Stack" },
            { id: "grid-2", bars: [{ w: "46%" }, { w: "46%" }], label: "2 cols" },
            { id: "grid-3", bars: [{ w: "30%" }, { w: "30%" }, { w: "30%" }], label: "3 cols" },
            { id: "grid-sidebar-l", bars: [{ w: "30%" }, { w: "62%" }], label: "Sidebar L" },
            { id: "grid-sidebar-r", bars: [{ w: "62%" }, { w: "30%" }], label: "Sidebar R" },
            { id: "free", free: true, label: "Free" },
          ].map((l) => (
            <button key={l.id} className={`cia-ext-ca-layout-btn${layout === l.id ? " is-active" : ""}`} onClick={() => changeLayout(l.id)} title={l.label}>
              <span className="cia-ext-ca-layout-preview">
                {l.free ? (
                  <span className="cia-ext-ca-layout-free"><span /><span /><span /></span>
                ) : l.bars.map((b, i) => <span key={i} className="cia-ext-ca-layout-bar" style={{ width: b.w }} />)}
              </span>
              <span className="cia-ext-ca-layout-name">{l.label}</span>
            </button>
          ))}
        </div>
        {isFree && <div className="cia-ext-ca-layout-tip">Milanote-style board — drag cards by their header to move, drag a card's corner to resize, drag empty space to pan, and Ctrl/⌘+scroll to zoom. Positions lock when the app is opened.</div>}
      </div>

      <div className="cia-ext-ca-section-title">
        <span>Widgets</span>
        <span className="cia-ext-ca-section-count">{widgets.length}</span>
      </div>
      {widgets.length === 0 && <div className="cia-ext-ca-empty"><span className="cia-ext-ca-empty-icon">✨</span>No widgets yet — tap "Add widget" below.</div>}

      {isFree ? (
        (
          <FreeBoard
            widgets={widgets}
            editable
            onMovePos={setWidgetPos}
            onAdd={() => { setAddingWidget(true); setPickerCat("all"); }}
            renderCard={(w, { onDragHandle }) => {
              const Comp = WIDGET_MAP[w.type];
              const meta = WIDGET_TYPES.find((t) => t.type === w.type);
              const isLayout = w.type === "header" || w.type === "divider";
              return (
                <div className="cia-ext-ca-widget-card cia-ext-ca-canvas-card">
                  <div className="cia-ext-ca-widget-head" onPointerDown={onDragHandle}>
                    <span className="cia-ext-ca-widget-grip" title="Drag to move">✥</span>
                    {isLayout ? <span className="cia-ext-ca-widget-type-label">{meta?.label}</span> : <input className="cia-ext-ca-widget-title" value={w.data.title ?? meta?.label ?? w.type} onChange={(e) => updateWidgetById(w.id, { ...w.data, title: e.target.value })} onPointerDown={(e) => e.stopPropagation()} />}
                    <div className="cia-ext-ca-widget-actions" onPointerDown={(e) => e.stopPropagation()}>
                      <button onClick={() => removeWidgetById(w.id)} title="Remove">×</button>
                    </div>
                  </div>
                  <div className="cia-ext-ca-canvas-card-body">{Comp && <Comp data={w.data} onChange={(d) => updateWidgetById(w.id, d)} editMode />}</div>
                </div>
              );
            }}
          />
        )
      ) : (
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
      )}

      {addingWidget ? (
        <div className="cia-ext-ca-widget-picker">
          <div className="cia-ext-ca-picker-head"><span className="cia-ext-ca-section-label">Add a widget</span><button className="cia-ext-ca-cancel-btn" onClick={() => setAddingWidget(false)}>Cancel</button></div>
          <div className="cia-ext-ca-picker-cats">
            <button className={`cia-ext-ca-picker-cat${pickerCat === "all" ? " is-active" : ""}`} onClick={() => setPickerCat("all")}>All</button>
            {WIDGET_CATEGORIES.map((c) => (<button key={c.id} className={`cia-ext-ca-picker-cat${pickerCat === c.id ? " is-active" : ""}`} onClick={() => setPickerCat(c.id)}>{c.label}</button>))}
          </div>
          <div className="cia-ext-ca-widget-grid">{filtered.map((wt) => (
            <button key={wt.type} className={`cia-ext-ca-widget-option${wt.category === "ai" ? " is-ai" : ""}`} onClick={() => addWidget(wt)}>
              {wt.category === "ai" && <span className="cia-ext-ca-widget-ai-badge">AI</span>}
              <strong>{wt.label}</strong>
              <small>{wt.desc}</small>
            </button>
          ))}</div>
        </div>
      ) : (
        <button className="cia-ext-ca-add-widget-btn" onClick={() => { setAddingWidget(true); setPickerCat("all"); }}>+ Add widget</button>
      )}

      <div className="cia-ext-ca-editor-footer">
        <button className="cia-ext-ca-cancel-btn" onClick={onCancel}>Cancel</button>
        <button className="cia-ext-ca-save-btn" disabled={!valid} onClick={() => onSave({ id: app?.id ?? crypto.randomUUID(), name: name.trim(), icon, desc: desc.trim(), color, layout, widgets })}>{app ? "Save changes" : "Create app"}</button>
      </div>
    </div>
  );
}

// ── App runner ─────────────────────────────────────────────────────────────
export function AppRunner({ app, onChange, onBack, onEdit }) {
  const updateWidget = (i, data) => onChange({ ...app, widgets: app.widgets.map((w, j) => (j === i ? { ...w, data } : w)) });
  const updateWidgetById = (id, data) => onChange({ ...app, widgets: app.widgets.map((w) => (w.id === id ? { ...w, data } : w)) });
  const moveWidgetPos = (id, pos) => onChange({ ...app, widgets: app.widgets.map((w) => (w.id === id ? { ...w, pos } : w)) });
  useEffect(() => { app.widgets.forEach((w) => { if (w.type === "scripter" && w.data.autoRun) { void runSandboxed(w.data.code ?? ""); } }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const isFree = app.layout === "free";

  const accent = app.color || "#7c3aed";
  return (
    <div className={`cia-ext-ca-runner${isFree ? " is-board-mode" : ""}`} style={{ "--ca-accent": accent }}>
      <div className="cia-ext-ca-runner-hero" style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}08 60%, transparent)` }}>
        <button className="cia-ext-ca-back-btn" onClick={onBack} aria-label="Back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div className="cia-ext-ca-runner-icon" style={{ background: accent }}>{app.icon}</div>
        <div className="cia-ext-ca-runner-meta">
          <div className="cia-ext-ca-runner-title">{app.name}</div>
          {app.desc && <div className="cia-ext-ca-runner-desc">{app.desc}</div>}
        </div>
        <button className="cia-ext-ca-edit-inline" onClick={onEdit} aria-label="Edit app">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
      </div>
      {isFree ? (
        <div className="cia-ext-ca-runner-canvas-wrap is-board">
          <FreeBoard
            widgets={app.widgets}
            editable
            full
            onMovePos={moveWidgetPos}
            renderCard={(w, { onDragHandle }) => {
              const Comp = WIDGET_MAP[w.type];
              const meta = WIDGET_TYPES.find((t) => t.type === w.type);
              const isAi = meta?.category === "ai";
              const isLayout = w.type === "header" || w.type === "divider";
              if (isLayout) return (
                <div className={`cia-ext-ca-widget-card cia-ext-ca-runner-card cia-ext-ca-canvas-card${isAi ? " is-ai" : ""}`}>
                  <div className="cia-ext-ca-widget-head cia-ext-ca-canvas-drag" onPointerDown={onDragHandle}><span className="cia-ext-ca-widget-grip">✥</span></div>
                  <div className="cia-ext-ca-canvas-card-body">{Comp && <Comp data={w.data} onChange={(d) => updateWidgetById(w.id, d)} editMode={false} />}</div>
                </div>
              );
              return (
                <div className={`cia-ext-ca-widget-card cia-ext-ca-runner-card cia-ext-ca-canvas-card${isAi ? " is-ai" : ""}`}>
                  <div className="cia-ext-ca-widget-head cia-ext-ca-canvas-drag" onPointerDown={onDragHandle}>
                    <span className="cia-ext-ca-widget-grip" title="Drag to move">✥</span>
                    <span className="cia-ext-ca-widget-title-static">{w.data.title ?? w.type}</span>
                    {isAi && <span className="cia-ext-ca-widget-ai-pill">✨ AI</span>}
                  </div>
                  <div className="cia-ext-ca-canvas-card-body">{Comp && <Comp data={w.data} onChange={(d) => updateWidgetById(w.id, d)} editMode={false} />}</div>
                </div>
              );
            }}
          />
        </div>
      ) : (
        <div className={`cia-ext-ca-runner-widgets${app.layout && app.layout !== "stack" ? ` ${app.layout}` : ""}`}>
          {app.widgets.map((w, i) => {
            const Comp = WIDGET_MAP[w.type];
            const meta = WIDGET_TYPES.find((t) => t.type === w.type);
            const isAi = meta?.category === "ai";
            if (w.type === "header" || w.type === "divider") return <div key={w.id} data-span="full">{Comp && <Comp data={w.data} onChange={(d) => updateWidget(i, d)} editMode={false} />}</div>;
            return (
              <div key={w.id} className={`cia-ext-ca-widget-card cia-ext-ca-runner-card${isAi ? " is-ai" : ""}`} style={{ animationDelay: `${i * 50}ms` }}>
                <div className="cia-ext-ca-widget-head">
                  <span className="cia-ext-ca-widget-title-static">{w.data.title ?? w.type}</span>
                  {isAi && <span className="cia-ext-ca-widget-ai-pill">✨ AI</span>}
                </div>
                {Comp && <Comp data={w.data} onChange={(d) => updateWidget(i, d)} editMode={false} />}
              </div>
            );
          })}
        </div>
      )}
      {app.widgets.length === 0 && <div className="cia-ext-ca-empty"><span className="cia-ext-ca-empty-icon">✨</span>This app has no widgets. Tap Edit to add some.</div>}
    </div>
  );
}

// ── Starter templates ─────────────────────────────────────────────────────
const tplWidget = (type, dataOverrides = {}) => {
  const meta = WIDGET_TYPES.find((w) => w.type === type);
  return { id: crypto.randomUUID(), type, data: { ...meta.defaults, ...dataOverrides } };
};

const APP_TEMPLATES = {
  testScripts: {
    name: "Test Cases",
    icon: "🧪",
    desc: "Generate BPT-style test cases with AI and track results",
    color: "#7c3aed",
    layout: "stack",
    widgets: [
      tplWidget("header", { title: "Business Process Testing", subtitle: "AI-generated test cases. Edit, run, mark Pass/Fail, export to CSV." }),
      tplWidget("ai_testscripts", { title: "Test Cases", module: "Debtors", moduleCode: "DB", count: 8 }),
      tplWidget("divider", { style: "space" }),
      tplWidget("notes", { title: "Tester notes", text: "" }),
    ],
  },
  aiToolkit: {
    name: "AI Toolkit",
    icon: "✨",
    desc: "All the AI helpers in one place",
    color: "#e4007c",
    layout: "stack",
    widgets: [
      tplWidget("header", { title: "AI helpers", subtitle: "Tap any widget to use it. Each one learns from your prior prompts." }),
      tplWidget("ai_writer"),
      tplWidget("ai_summary"),
      tplWidget("ai_translate"),
      tplWidget("ai_sql"),
      tplWidget("ai_regex"),
      tplWidget("ai_brainstorm"),
    ],
  },
  standup: {
    name: "Standup Board",
    icon: "📋",
    desc: "Daily kanban + checklist + standup notes",
    color: "#0ea5e9",
    layout: "stack",
    widgets: [
      tplWidget("kanban", { title: "Sprint board" }),
      tplWidget("checklist", { title: "Today's checklist", items: [{ text: "Standup", done: false }, { text: "PRs to review", done: false }] }),
      tplWidget("notes", { title: "Standup notes", text: "" }),
    ],
  },
};

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

  const handleStartFromTemplate = (tpl) => {
    const newApp = { id: crypto.randomUUID(), ...tpl };
    persist([...apps, newApp]);
    setActiveApp(newApp);
    setMode("edit");
  };

  if (mode === "create" || mode === "edit") return (<div className="cia-ext-settings-overlay cia-ext-ca-panel"><AppEditor app={mode === "edit" ? activeApp : null} onSave={handleSave} onCancel={() => { setMode("list"); setActiveApp(null); }} /></div>);
  if (mode === "run" && activeApp) return (<div className="cia-ext-settings-overlay cia-ext-ca-panel"><AppRunner app={activeApp} onChange={handleRunChange} onBack={() => { setMode("list"); setActiveApp(null); }} onEdit={() => setMode("edit")} /></div>);

  return (
    <div className="cia-ext-settings-overlay cia-ext-ca-panel">
      <div className="cia-ext-settings-header"><strong>App Creator</strong></div>
      <div className="cia-ext-ca-body">
        <div className="cia-ext-ca-intro">Build custom micro-apps from {WIDGET_TYPES.length} widget types — including {WIDGET_TYPES.filter((w) => w.category === "ai").length} AI-powered ones.</div>
        <div className="cia-ext-ca-templates">
          <div className="cia-ext-ca-templates-label">Quick start</div>
          <div className="cia-ext-ca-templates-grid">
            <button className="cia-ext-ca-template-tile" onClick={() => handleStartFromTemplate(APP_TEMPLATES.testScripts)}>
              <span className="cia-ext-ca-template-icon" style={{ background: "#7c3aed" }}>🧪</span>
              <span><strong>Test Cases</strong><small>BPT template with AI generation</small></span>
            </button>
            <button className="cia-ext-ca-template-tile" onClick={() => handleStartFromTemplate(APP_TEMPLATES.aiToolkit)}>
              <span className="cia-ext-ca-template-icon" style={{ background: "#e4007c" }}>✨</span>
              <span><strong>AI Toolkit</strong><small>SQL, writer, translate & more</small></span>
            </button>
            <button className="cia-ext-ca-template-tile" onClick={() => handleStartFromTemplate(APP_TEMPLATES.standup)}>
              <span className="cia-ext-ca-template-icon" style={{ background: "#0ea5e9" }}>📋</span>
              <span><strong>Standup Board</strong><small>Kanban + checklist + notes</small></span>
            </button>
          </div>
        </div>
        <button className="cia-ext-ca-create-btn" onClick={() => setMode("create")}>+ Create blank app</button>
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

import { useCallback, useEffect, useRef, useState } from "react";
import { ACTION_TYPE_OPTIONS, actionTypeLabel } from "../lib/bpa.js";

// ── Element dimensions ────────────────────────────────────────────────────
const DIM = {
  start: [44, 44],
  end: [44, 44],
  task: [170, 62],
  "doc-task": [170, 62],
  subprocess: [176, 66],
  decision: [120, 66],
  annotation: [164, 50],
};
const dw = (t) => DIM[t][0];
const dh = (t) => DIM[t][1];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const PALETTE = [
  { t: "start", label: "Start Event", sub: "Flow entry" },
  { t: "end", label: "End Event", sub: "Flow exit" },
  { t: "task", label: "User Task", sub: "Person action" },
  { t: "doc-task", label: "Doc Task", sub: "Person + document" },
  { t: "subprocess", label: "Subprocess", sub: "Linked process" },
  { t: "decision", label: "Decision", sub: "Branch / gateway" },
  { t: "annotation", label: "Annotation", sub: "Comment / note" },
];

const NEW_LABEL = {
  task: "New Task",
  "doc-task": "Document Task",
  subprocess: "Subprocess",
  decision: "Decision?",
  annotation: "Note",
  start: "",
  end: "",
};

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Port geometry ──────────────────────────────────────────────────────────
function portPos(n, side) {
  const w = dw(n.type),
    h = dh(n.type),
    cx = n.x + w / 2,
    cy = n.y + h / 2;
  if (side === "left") return { x: n.x, y: cy };
  if (side === "right") return { x: n.x + w, y: cy };
  if (side === "top") return { x: cx, y: n.y };
  return { x: cx, y: n.y + h };
}

function connPath(fp, tp, wps = []) {
  if (!wps.length) {
    const dx = tp.x - fp.x;
    const bend = Math.max(Math.abs(dx) * 0.45, 40);
    return `M${fp.x},${fp.y} C${fp.x + bend},${fp.y} ${tp.x - bend},${tp.y} ${tp.x},${tp.y}`;
  }
  const pts = [fp, ...wps, tp];
  return "M" + pts.map((p) => `${p.x},${p.y}`).join(" L");
}
function pathMid(fp, tp, wps = []) {
  const pts = [fp, ...wps, tp];
  const mid = Math.floor(pts.length / 2);
  return pts.length % 2 === 1
    ? pts[mid]
    : { x: (pts[mid - 1].x + pts[mid].x) / 2, y: (pts[mid - 1].y + pts[mid].y) / 2 };
}
function distToSeg(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function wrap(text, max) {
  if (!text) return [""];
  if (text.length <= max) return [text];
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (test.length > max && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > 2) return [lines[0], lines[1].slice(0, max - 1) + "…"];
  return lines;
}

// ── Node SVG (light blueprint theme) ────────────────────────────────────────
function NodeShape({ n, selected, showPorts, onNodeDown, onPortDown, onDblNode, onHover }) {
  const w = dw(n.type),
    h = dh(n.type);
  const sc = selected ? "#2563eb" : "#4a80d4";
  const sf = selected ? "#eff6ff" : "#ffffff";
  const sw = selected ? 2 : 1.5;
  const sides = ["left", "right", "top", "bottom"];

  let body = null;
  if (n.type === "start" || n.type === "end") {
    const cx = n.x + 22,
      cy = n.y + 22;
    body = (
      <>
        <circle cx={cx} cy={cy} r="22" fill={sf} stroke={sc} strokeWidth={sw} />
        {n.type === "start" ? (
          <circle cx={cx} cy={cy} r="8" fill={sc} opacity="0.35" />
        ) : (
          <circle cx={cx} cy={cy} r="13" fill="none" stroke={sc} strokeWidth={sw} />
        )}
      </>
    );
  } else if (n.type === "decision") {
    const cx = n.x + w / 2,
      cy = n.y + h / 2;
    body = (
      <polygon
        points={`${cx},${n.y} ${n.x + w},${cy} ${cx},${n.y + h} ${n.x},${cy}`}
        fill={sf}
        stroke={sc}
        strokeWidth={sw}
      />
    );
  } else {
    body = (
      <>
        <rect
          x={n.x}
          y={n.y}
          width={w}
          height={h}
          rx={n.type === "annotation" ? 3 : 6}
          fill={sf}
          stroke={sc}
          strokeWidth={sw}
          strokeDasharray={n.type === "annotation" ? "6 3" : undefined}
        />
        {n.type === "task" || n.type === "doc-task" ? (
          <PersonIcon x={n.x + 6} y={n.y + 6} c={sc} />
        ) : null}
        {n.type === "doc-task" ? <DocIcon x={n.x + w - 24} y={n.y + 6} c={sc} /> : null}
        {n.type === "subprocess" ? (
          <g stroke={sc} fill="none" strokeLinecap="round">
            <rect x={n.x + w / 2 - 7} y={n.y + h - 18} width="14" height="12" rx="2" strokeWidth="1.3" />
            <line x1={n.x + w / 2} y1={n.y + h - 15} x2={n.x + w / 2} y2={n.y + h - 9} strokeWidth="1.3" />
            <line x1={n.x + w / 2 - 3} y1={n.y + h - 12} x2={n.x + w / 2 + 3} y2={n.y + h - 12} strokeWidth="1.3" />
          </g>
        ) : null}
      </>
    );
  }

  // Label
  let label = null;
  if (n.type !== "start" && n.type !== "end") {
    const mc = Math.floor((w - 22) / (10.5 * 0.58));
    const lines = wrap(n.label || "", mc);
    const lh = 14,
      totH = lines.length * lh,
      baseY = n.y + h / 2 - totH / 2 + lh / 2;
    label = (
      <>
        {lines.map((l, i) => (
          <text
            key={i}
            x={n.x + w / 2}
            y={baseY + i * lh}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="10.5"
            fill="#1e293b"
            fontWeight={i === 0 ? 600 : 400}
          >
            {l}
          </text>
        ))}
        {n.assignee ? (
          <text x={n.x + w / 2} y={n.y + h - 6} textAnchor="middle" fontSize="9" fill="#94a3b8">
            {n.assignee}
          </text>
        ) : null}
      </>
    );
  }

  const ring =
    selected && n.type !== "start" && n.type !== "end" ? (
      <rect
        x={n.x - 5}
        y={n.y - 5}
        width={w + 10}
        height={h + 10}
        rx="10"
        fill="none"
        stroke="#93c5fd"
        strokeWidth="1.5"
        strokeDasharray="5 3"
        pointerEvents="none"
      />
    ) : null;

  return (
    <g
      style={{ cursor: "grab" }}
      onMouseEnter={() => onHover(n.id)}
      onMouseLeave={() => onHover(null)}
    >
      {ring}
      <g
        onMouseDown={(e) => onNodeDown(e, n)}
        onDoubleClick={(e) => onDblNode(e, n)}
      >
        {body}
        {label}
      </g>
      {sides.map((side) => {
        const p = portPos(n, side);
        return (
          <circle
            key={side}
            cx={p.x}
            cy={p.y}
            r="5.5"
            fill="#ffffff"
            stroke="#3b82f6"
            strokeWidth="2"
            style={{ cursor: "crosshair", opacity: showPorts ? 1 : 0 }}
            onMouseDown={(e) => onPortDown(e, n, side)}
          />
        );
      })}
    </g>
  );
}

function PersonIcon({ x, y, c }) {
  return (
    <g transform={`translate(${x},${y}) scale(${18 / 16})`} stroke={c} fill="none" strokeLinecap="round">
      <circle cx="8" cy="5.5" r="3.6" strokeWidth="1.4" />
      <path d="M1 17.5Q1.5 11 8 11Q14.5 11 15 17.5" strokeWidth="1.4" />
    </g>
  );
}
function DocIcon({ x, y, c }) {
  return (
    <g transform={`translate(${x},${y}) scale(${18 / 16})`} stroke={c} fill="none" strokeLinecap="round">
      <path d="M3 1h7l3 3v12H3V1z" strokeWidth="1.4" />
      <path d="M10 1v3h3" strokeWidth="1.2" />
      <line x1="5.5" y1="8" x2="10.5" y2="8" strokeWidth="1.1" />
      <line x1="5.5" y1="11" x2="10.5" y2="11" strokeWidth="1.1" />
    </g>
  );
}

function PaletteIcon({ t }) {
  const sc = "#3b82f6";
  if (t === "start")
    return (
      <svg width="30" height="30" viewBox="0 0 30 30">
        <circle cx="15" cy="15" r="12" fill="none" stroke={sc} strokeWidth="1.8" />
        <circle cx="15" cy="15" r="5" fill={sc} opacity="0.35" />
      </svg>
    );
  if (t === "end")
    return (
      <svg width="30" height="30" viewBox="0 0 30 30">
        <circle cx="15" cy="15" r="12" fill="none" stroke={sc} strokeWidth="1.8" />
        <circle cx="15" cy="15" r="7" fill="none" stroke={sc} strokeWidth="1.8" />
      </svg>
    );
  if (t === "decision")
    return (
      <svg width="38" height="24" viewBox="0 0 38 24">
        <polygon points="19,2 36,12 19,22 2,12" fill="white" stroke={sc} strokeWidth="1.5" />
      </svg>
    );
  if (t === "annotation")
    return (
      <svg width="38" height="24" viewBox="0 0 38 24">
        <rect x="1" y="1" width="36" height="22" rx="3" fill="white" stroke={sc} strokeWidth="1.5" strokeDasharray="5 3" />
        <line x1="7" y1="9" x2="31" y2="9" stroke={sc} strokeWidth="1" />
        <line x1="7" y1="14" x2="26" y2="14" stroke={sc} strokeWidth="1" />
      </svg>
    );
  return (
    <svg width="38" height="24" viewBox="0 0 38 24">
      <rect x="1" y="1" width="36" height="22" rx="5" fill="white" stroke={sc} strokeWidth="1.5" />
      {t === "subprocess" ? (
        <rect x="14" y="13" width="10" height="8" rx="1.5" fill="none" stroke={sc} strokeWidth="1.3" />
      ) : (
        <g transform="translate(5,4) scale(.78)" stroke={sc} fill="none" strokeLinecap="round">
          <circle cx="8" cy="5.5" r="3.6" strokeWidth="1.4" />
          <path d="M1 17.5Q1.5 11 8 11Q14.5 11 15 17.5" strokeWidth="1.4" />
        </g>
      )}
    </svg>
  );
}

// ── Main editor ──────────────────────────────────────────────────────────
export function BpaGraph({ model, onChange }) {
  const [m, setM] = useState(model);
  const [view, setView] = useState({ x: 80, y: 60, s: 1 });
  const [sel, setSel] = useState(null); // {t:'node'|'conn', id}
  const [pending, setPending] = useState(null);
  const [hover, setHover] = useState(null);
  const [link, setLink] = useState(null);
  const [edit, setEdit] = useState(null); // {kind:'node'|'conn', id, sx, sy, w, value}
  const [expanded, setExpanded] = useState(false);

  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const linkRef = useRef(null);
  const mRef = useRef(m);
  mRef.current = m;

  // Sync from parent when not mid-interaction.
  useEffect(() => {
    if (!dragRef.current && !linkRef.current) setM(model);
  }, [model]);

  const commit = useCallback(
    (nm) => {
      setM(nm);
      onChange?.(nm);
    },
    [onChange],
  );

  const nodeById = (id) => mRef.current.nodes.find((n) => n.id === id);
  const connById = (id) => mRef.current.connections.find((c) => c.id === id);

  const toSVG = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.s, y: (e.clientY - r.top - view.y) / view.s };
  };

  // Wheel zoom (non-passive)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(),
        mx = e.clientX - r.left,
        my = e.clientY - r.top;
      setView((v) => {
        const ns = clamp(v.s + (e.deltaY > 0 ? -0.12 : 0.12), 0.2, 3.5),
          k = ns / v.s;
        return { s: ns, x: mx - k * (mx - v.x), y: my - k * (my - v.y) };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keyboard: Delete / Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.matches?.("input,textarea,select")) return;
      if (e.key === "Escape") {
        setPending(null);
        linkRef.current = null;
        setLink(null);
        setSel(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && sel) delSel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  const delSel = () => {
    if (!sel) return;
    const cur = mRef.current;
    if (sel.t === "node") {
      const n = cur.nodes.find((x) => x.id === sel.id);
      if (!n) return;
      commit({
        nodes: cur.nodes.filter((x) => x.id !== sel.id),
        connections: cur.connections.filter((c) => c.fromId !== sel.id && c.toId !== sel.id),
      });
    } else {
      commit({ nodes: cur.nodes, connections: cur.connections.filter((c) => c.id !== sel.id) });
    }
    setSel(null);
  };

  // ── Mouse on canvas background ──
  const onCanvasDown = (e) => {
    if (e.target?.closest?.(".cia-bp-side, .cia-bp-props, .cia-bp-toolbar")) return;
    const pt = toSVG(e);
    if (pending) {
      // Only one Start event is allowed per process.
      if (pending === "start" && mRef.current.nodes.some((n) => n.type === "start")) {
        setPending(null);
        return;
      }
      const w = dw(pending),
        h = dh(pending);
      const n = {
        id: uid(),
        type: pending,
        x: Math.round((pt.x - w / 2) / 10) * 10,
        y: Math.round((pt.y - h / 2) / 10) * 10,
        label: NEW_LABEL[pending] || "",
        assignee: "",
      };
      commit({ nodes: [...mRef.current.nodes, n], connections: mRef.current.connections });
      setSel({ t: "node", id: n.id });
      setPending(null);
      return;
    }
    panRef.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    setSel(null);
  };

  const onNodeDown = (e, n) => {
    e.stopPropagation();
    setSel({ t: "node", id: n.id });
    dragRef.current = { t: "node", id: n.id, sx: e.clientX, sy: e.clientY, nx: n.x, ny: n.y, moved: false };
  };
  const onPortDown = (e, n, side) => {
    e.stopPropagation();
    linkRef.current = { fromId: n.id, fromSide: side, fp: portPos(n, side) };
    setLink({ ...linkRef.current, cur: portPos(n, side) });
  };
  const onConnDown = (e, c) => {
    e.stopPropagation();
    setSel({ t: "conn", id: c.id });
  };
  // Add a breakpoint where a wire was double-clicked (inserted on nearest segment).
  const addWaypointAt = (c, pt) => {
    const fn = nodeById(c.fromId),
      tn = nodeById(c.toId);
    if (!fn || !tn) return;
    const fp = portPos(fn, c.fromSide),
      tp = portPos(tn, c.toSide);
    const segs = [fp, ...c.waypoints, tp];
    let best = c.waypoints.length,
      bd = Infinity;
    for (let i = 0; i < segs.length - 1; i += 1) {
      const dd = distToSeg(pt, segs[i], segs[i + 1]);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    const wps = [...c.waypoints];
    wps.splice(best, 0, { x: Math.round(pt.x / 10) * 10, y: Math.round(pt.y / 10) * 10 });
    setSel({ t: "conn", id: c.id });
    commit({ ...mRef.current, connections: mRef.current.connections.map((x) => (x.id === c.id ? { ...x, waypoints: wps } : x)) });
  };
  const onWpDown = (e, c, i) => {
    e.stopPropagation();
    setSel({ t: "conn", id: c.id });
    dragRef.current = { t: "wp", id: c.id, i, sx: e.clientX, sy: e.clientY, wx: c.waypoints[i].x, wy: c.waypoints[i].y };
  };

  const onMove = (e) => {
    if (linkRef.current) {
      setLink({ ...linkRef.current, cur: toSVG(e) });
      return;
    }
    const d = dragRef.current;
    if (d?.t === "node") {
      const dx = (e.clientX - d.sx) / view.s,
        dy = (e.clientY - d.sy) / view.s;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      setM((cur) => ({
        ...cur,
        nodes: cur.nodes.map((n) =>
          n.id === d.id
            ? { ...n, x: Math.round((d.nx + dx) / 10) * 10, y: Math.round((d.ny + dy) / 10) * 10 }
            : n,
        ),
      }));
    } else if (d?.t === "wp") {
      const dx = (e.clientX - d.sx) / view.s,
        dy = (e.clientY - d.sy) / view.s;
      setM((cur) => ({
        ...cur,
        connections: cur.connections.map((c) =>
          c.id === d.id
            ? {
                ...c,
                waypoints: c.waypoints.map((w, wi) =>
                  wi === d.i ? { x: Math.round((d.wx + dx) / 10) * 10, y: Math.round((d.wy + dy) / 10) * 10 } : w,
                ),
              }
            : c,
        ),
      }));
    } else if (panRef.current) {
      const p = panRef.current;
      setView((v) => ({ ...v, x: p.vx + (e.clientX - p.sx), y: p.vy + (e.clientY - p.sy) }));
    }
  };

  const onUp = (e) => {
    if (linkRef.current) {
      const lk = linkRef.current;
      linkRef.current = null;
      setLink(null);
      const pt = toSVG(e);
      let toId = null,
        toSide = "left";
      for (const n of mRef.current.nodes) {
        if (n.id === lk.fromId) continue;
        for (const s of ["left", "right", "top", "bottom"]) {
          const p = portPos(n, s);
          if (Math.hypot(p.x - pt.x, p.y - pt.y) < 30) {
            toId = n.id;
            toSide = s;
            break;
          }
        }
        if (toId) break;
      }
      // Also: dropped inside a node body
      if (!toId) {
        for (const n of mRef.current.nodes) {
          if (n.id === lk.fromId) continue;
          if (pt.x >= n.x && pt.x <= n.x + dw(n.type) && pt.y >= n.y && pt.y <= n.y + dh(n.type)) {
            toId = n.id;
            let bd = Infinity;
            ["left", "right", "top", "bottom"].forEach((s) => {
              const p = portPos(n, s),
                dd = Math.hypot(p.x - pt.x, p.y - pt.y);
              if (dd < bd) {
                bd = dd;
                toSide = s;
              }
            });
            break;
          }
        }
      }
      if (toId) {
        commit({
          nodes: mRef.current.nodes,
          connections: [
            ...mRef.current.connections,
            {
              id: "c" + uid(),
              fromId: lk.fromId,
              fromSide: lk.fromSide,
              toId,
              toSide,
              label: "",
              waypoints: [],
              decisionId: "",
              actionId: "",
            },
          ],
        });
      }
      return;
    }
    const d = dragRef.current;
    dragRef.current = null;
    if (d && (d.t === "node" ? d.moved : true)) onChange?.(mRef.current);
    panRef.current = null;
  };

  const onCanvasDbl = (e) => {
    const pt = toSVG(e);
    const el = e.target;
    const cid = el?.getAttribute?.("data-cid") || el?.parentElement?.getAttribute?.("data-cid");
    // dbl on waypoint handle removes it
    const wpc = el?.getAttribute?.("data-wp");
    if (wpc) {
      const [id, i] = wpc.split("|");
      const c = connById(id);
      if (c) commit({ ...mRef.current, connections: mRef.current.connections.map((x) => (x.id === id ? { ...x, waypoints: x.waypoints.filter((_, wi) => wi !== +i) } : x)) });
      return;
    }
  };

  // ── Label editing ──
  const startEditNode = (e, n) => {
    e.stopPropagation();
    if (n.type === "start" || n.type === "end") return;
    setEdit({ kind: "node", id: n.id, value: n.label || "" });
  };
  const startEditConn = (c) => setEdit({ kind: "conn", id: c.id, value: c.label || "" });
  const commitEdit = () => {
    if (!edit) return;
    const v = edit.value;
    const cur = mRef.current;
    if (edit.kind === "node")
      commit({ ...cur, nodes: cur.nodes.map((n) => (n.id === edit.id ? { ...n, label: v } : n)) });
    else commit({ ...cur, connections: cur.connections.map((c) => (c.id === edit.id ? { ...c, label: v } : c)) });
    setEdit(null);
  };

  // Editor screen position
  const editPos = (() => {
    if (!edit) return null;
    if (edit.kind === "node") {
      const n = nodeById(edit.id);
      if (!n) return null;
      return { x: n.x + dw(n.type) / 2, y: n.y + dh(n.type) / 2, w: Math.max(110, dw(n.type) * 0.95) };
    }
    const c = connById(edit.id);
    const fn = nodeById(c.fromId),
      tn = nodeById(c.toId);
    if (!fn || !tn) return null;
    const mid = pathMid(portPos(fn, c.fromSide), portPos(tn, c.toSide), c.waypoints);
    return { x: mid.x, y: mid.y, w: 130 };
  })();
  const editScreen = editPos
    ? { x: editPos.x * view.s + view.x, y: editPos.y * view.s + view.y, w: editPos.w }
    : null;

  // ── View controls ──
  const zoomBy = (d) => {
    const r = svgRef.current.getBoundingClientRect(),
      cx = r.width / 2,
      cy = r.height / 2;
    setView((v) => {
      const ns = clamp(v.s + d, 0.2, 3.5),
        k = ns / v.s;
      return { s: ns, x: cx - k * (cx - v.x), y: cy - k * (cy - v.y) };
    });
  };
  const fitView = () => {
    const ns = mRef.current.nodes;
    if (!ns.length) {
      setView({ x: 80, y: 60, s: 1 });
      return;
    }
    let mx = Infinity,
      my = Infinity,
      MX = -Infinity,
      MY = -Infinity;
    for (const n of ns) {
      mx = Math.min(mx, n.x);
      my = Math.min(my, n.y);
      MX = Math.max(MX, n.x + dw(n.type));
      MY = Math.max(MY, n.y + dh(n.type));
    }
    const r = svgRef.current.getBoundingClientRect();
    const cw = r.width - 100,
      ch = r.height - 100,
      bw = MX - mx || 1,
      bh = MY - my || 1;
    const s = clamp(Math.min(cw / bw, ch / bh), 0.2, 2.2);
    setView({ s, x: (cw - bw * s) / 2 + 50 - mx * s, y: (ch - bh * s) / 2 + 50 - my * s });
  };

  const selNode = sel?.t === "node" ? nodeById(sel.id) : null;
  const selConn = sel?.t === "conn" ? connById(sel.id) : null;

  const updateSelNode = (patch) =>
    commit({ ...mRef.current, nodes: mRef.current.nodes.map((n) => (n.id === sel.id ? { ...n, ...patch } : n)) });
  const updateSelConn = (patch) =>
    commit({ ...mRef.current, connections: mRef.current.connections.map((c) => (c.id === sel.id ? { ...c, ...patch } : c)) });

  return (
    <div className={`cia-bp${expanded ? " is-expanded" : ""}`}>
      {/* Palette */}
      <div className="cia-bp-side">
        <div className="cia-bp-side-h">Elements</div>
        {PALETTE.map((it) => {
          const blocked = it.t === "start" && m.nodes.some((n) => n.type === "start");
          return (
            <button
              key={it.t}
              type="button"
              className={`cia-bp-pe${pending === it.t ? " on" : ""}`}
              disabled={blocked}
              title={blocked ? "Only one Start event per process" : undefined}
              onClick={() => setPending((p) => (p === it.t ? null : it.t))}
            >
              <span className="cia-bp-pe-ico">
                <PaletteIcon t={it.t} />
              </span>
              <span>
                <span className="cia-bp-pe-lbl">{it.label}</span>
                <span className="cia-bp-pe-sub">
                  {blocked ? "Already placed" : it.sub}
                </span>
              </span>
            </button>
          );
        })}
        <div className="cia-bp-hints">
          <b>Place:</b> click element, click canvas
          <br />
          <b>Connect:</b> drag from a node's port ●
          <br />
          <b>Breakpoint:</b> dbl-click wire · drag the ●
          <br />
          <b>Edit label:</b> dbl-click node/wire
          <br />
          <b>Delete:</b> select → Del · <b>Pan:</b> drag · <b>Zoom:</b> scroll
        </div>
      </div>

      {/* Canvas */}
      <div className="cia-bp-canvas">
        <div className="cia-bp-toolbar">
          <button type="button" onClick={fitView} title="Fit all">
            ⊞ Fit
          </button>
          <div className="cia-bp-zoom">
            <button type="button" onClick={() => zoomBy(-0.15)}>
              −
            </button>
            <span>{Math.round(view.s * 100)}%</span>
            <button type="button" onClick={() => zoomBy(0.15)}>
              +
            </button>
          </div>
          <button type="button" onClick={() => setExpanded((v) => !v)} title="Expand">
            {expanded ? "🗗" : "⤢"}
          </button>
        </div>

        <svg
          ref={svgRef}
          className={`cia-bp-svg${pending ? " placing" : ""}`}
          width="100%"
          height="100%"
          onMouseDown={onCanvasDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={() => {
            panRef.current = null;
            dragRef.current = null;
            linkRef.current = null;
            setLink(null);
          }}
          onDoubleClick={onCanvasDbl}
        >
          <defs>
            <marker id="bp-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M1.5 1.5L8.5 5L1.5 8.5" fill="none" stroke="#7a90b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id="bp-arrs" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M1.5 1.5L8.5 5L1.5 8.5" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <pattern id="bp-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="0.9" fill="#c0c4ce" opacity="0.6" />
            </pattern>
          </defs>
          <rect x="-8000" y="-8000" width="16000" height="16000" fill="url(#bp-grid)" />
          <g transform={`translate(${view.x},${view.y}) scale(${view.s})`}>
            {/* connections */}
            {m.connections.map((c) => {
              const fn = nodeById(c.fromId),
                tn = nodeById(c.toId);
              if (!fn || !tn) return null;
              const fp = portPos(fn, c.fromSide),
                tp = portPos(tn, c.toSide);
              const seld = sel?.t === "conn" && sel.id === c.id;
              const d = connPath(fp, tp, c.waypoints);
              const mid = pathMid(fp, tp, c.waypoints);
              const stroke = seld ? "#2563eb" : "#7a90b8";
              return (
                <g key={c.id} data-cid={c.id} style={{ cursor: "pointer" }}>
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="14"
                    onMouseDown={(e) => onConnDown(e, c)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      addWaypointAt(c, toSVG(e));
                    }}
                  />
                  <path d={d} fill="none" stroke={stroke} strokeWidth={seld ? 2 : 1.5} markerEnd={`url(#${seld ? "bp-arrs" : "bp-arr"})`} strokeLinecap="round" pointerEvents="none" />
                  {c.label ? (
                    <g pointerEvents="none">
                      <rect x={mid.x - (c.label.length * 6 + 14) / 2} y={mid.y - 9} width={c.label.length * 6 + 14} height="16" rx="3" fill="white" stroke={stroke} strokeWidth="0.8" />
                      <text x={mid.x} y={mid.y - 1} textAnchor="middle" dominantBaseline="central" fontSize="9.5" fontWeight="600" fill={seld ? "#1d4ed8" : "#64748b"}>
                        {c.label}
                      </text>
                    </g>
                  ) : null}
                  {seld
                    ? c.waypoints.map((wp, i) => (
                        <circle
                          key={i}
                          data-wp={`${c.id}|${i}`}
                          cx={wp.x}
                          cy={wp.y}
                          r="6"
                          fill="#fff"
                          stroke="#2563eb"
                          strokeWidth="2"
                          style={{ cursor: "move" }}
                          onMouseDown={(e) => onWpDown(e, c, i)}
                        />
                      ))
                    : null}
                  {seld
                    ? [fp, ...c.waypoints, tp].slice(0, -1).map((a, i) => {
                        const b = [fp, ...c.waypoints, tp][i + 1];
                        return (
                          <circle
                            key={`g${i}`}
                            cx={(a.x + b.x) / 2}
                            cy={(a.y + b.y) / 2}
                            r="4"
                            fill="#93c5fd"
                            stroke="#2563eb"
                            strokeWidth="1.5"
                            opacity="0.7"
                            style={{ cursor: "copy" }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              const np = { x: Math.round((a.x + b.x) / 2 / 10) * 10, y: Math.round((a.y + b.y) / 2 / 10) * 10 };
                              const wps = [...c.waypoints];
                              wps.splice(i, 0, np);
                              commit({ ...mRef.current, connections: mRef.current.connections.map((x) => (x.id === c.id ? { ...x, waypoints: wps } : x)) });
                              dragRef.current = { t: "wp", id: c.id, i, sx: e.clientX, sy: e.clientY, wx: np.x, wy: np.y };
                            }}
                          />
                        );
                      })
                    : null}
                </g>
              );
            })}

            {/* temp link wire */}
            {link ? (
              <path
                d={connPath(link.fp, link.cur)}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="1.5"
                strokeDasharray="6 3"
                markerEnd="url(#bp-arrs)"
                pointerEvents="none"
              />
            ) : null}

            {/* nodes */}
            {m.nodes.map((n) => (
              <NodeShape
                key={n.id}
                n={n}
                selected={sel?.t === "node" && sel.id === n.id}
                showPorts={hover === n.id || (link && link.fromId !== n.id)}
                onNodeDown={onNodeDown}
                onPortDown={onPortDown}
                onDblNode={startEditNode}
                onHover={setHover}
              />
            ))}
          </g>
        </svg>

        {/* Inline label editor */}
        {editScreen ? (
          <input
            className="cia-bp-led"
            autoFocus
            value={edit.value}
            style={{ left: editScreen.x - editScreen.w / 2, top: editScreen.y - 13, width: editScreen.w }}
            onChange={(e) => setEdit((ed) => ({ ...ed, value: e.target.value }))}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") setEdit(null);
            }}
          />
        ) : null}

        {/* Properties panel */}
        {selNode || selConn ? (
          <div className="cia-bp-props">
            <div className="cia-bp-props-h">
              <span>{selNode ? "Step" : "Connection"}</span>
              <span className="cia-bp-props-x" onClick={() => setSel(null)}>
                ×
              </span>
            </div>
            {selNode ? (
              <>
                <div className="cia-bp-pr">
                  <div className="cia-bp-pl">Label</div>
                  <input className="cia-bp-pi" value={selNode.label} onChange={(e) => updateSelNode({ label: e.target.value })} />
                </div>
                {selNode.type !== "start" && selNode.type !== "end" && selNode.type !== "annotation" ? (
                  <div className="cia-bp-pr">
                    <div className="cia-bp-pl">Assignee / Role</div>
                    <input className="cia-bp-pi" value={selNode.assignee} placeholder="Name or role" onChange={(e) => updateSelNode({ assignee: e.target.value })} />
                  </div>
                ) : null}
                <div className="cia-bp-pr">
                  <div className="cia-bp-pl">Type</div>
                  <div className="cia-bp-pv">{selNode.type.replace(/-/g, " ")}</div>
                </div>
                {selNode.type !== "start" && selNode.type !== "end" ? (
                  <button type="button" className="cia-bp-del" onClick={delSel}>
                    Delete step
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <div className="cia-bp-pr">
                  <div className="cia-bp-pl">Decision / Label</div>
                  <input className="cia-bp-pi" value={selConn.label} placeholder="e.g. Approved" onChange={(e) => updateSelConn({ label: e.target.value })} />
                </div>
                {nodeById(selConn.fromId)?.type === "start" ? (
                  <div className="cia-bp-pr">
                    <div className="cia-bp-pv">Start trigger — no decision actions.</div>
                  </div>
                ) : (
                  <div className="cia-bp-pr">
                    <div className="cia-bp-pl">Decision Actions</div>
                    <div className="cia-bp-acts">
                      {(selConn.actions || []).map((a, i) => (
                        <div key={i} className="cia-bp-act">
                          <div className="cia-bp-act-row">
                            <span className="cia-bp-act-seq">{(i + 1) * 10}</span>
                            <select
                              value={a.type || "START_TASK"}
                              onChange={(e) => {
                                const opt = ACTION_TYPE_OPTIONS.find((o) => o.type === e.target.value);
                                const acts = (selConn.actions || []).map((x, xi) =>
                                  xi === i
                                    ? { ...x, type: e.target.value, description: x.description || opt?.hint || "" }
                                    : x,
                                );
                                updateSelConn({ actions: acts });
                              }}
                            >
                              {ACTION_TYPE_OPTIONS.map((o) => (
                                <option key={o.type} value={o.type}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="cia-bp-act-x"
                              title="Remove action"
                              onClick={() =>
                                updateSelConn({ actions: (selConn.actions || []).filter((_, xi) => xi !== i) })
                              }
                            >
                              ×
                            </button>
                          </div>
                          <input
                            className="cia-bp-pi"
                            value={a.description || ""}
                            placeholder={`${actionTypeLabel(a.type)} description`}
                            onChange={(e) => {
                              const acts = (selConn.actions || []).map((x, xi) =>
                                xi === i ? { ...x, description: e.target.value } : x,
                              );
                              updateSelConn({ actions: acts });
                            }}
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        className="cia-bp-act-add"
                        onClick={() => {
                          const opt = ACTION_TYPE_OPTIONS.find((o) => o.type === "NOTIFICATION");
                          updateSelConn({
                            actions: [
                              ...(selConn.actions || []),
                              { type: "NOTIFICATION", description: opt?.hint || "" },
                            ],
                          });
                        }}
                      >
                        + Add action
                      </button>
                    </div>
                  </div>
                )}
                <button type="button" className="cia-bp-del" onClick={delSel}>
                  Delete connection
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

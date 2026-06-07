import { useEffect, useMemo, useRef, useState } from "react";
import { actionTypeLabel } from "../lib/bpa.js";

const NODE_W = 210;
const NODE_H = 64;
const HEAD_H = 24;
const COL_W = 300;
const ROW_H = 130;
const PAD_TOP = 80;
const PAD_LEFT = 30;
const ICON = { start: "▶", end: "■", user: "👤" };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// A rounded-top / square-bottom rect path (blueprint node header).
function topRoundedPath(w, h, r) {
  return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h} H 0 V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
}

function layoutGraph(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start =
    nodes.find((n) => n.icon === "start") ?? [...nodes].sort((a, b) => a.seq - b.seq)[0];

  const adj = new Map(nodes.map((n) => [n.id, []]));
  edges.forEach((e, i) => {
    if (adj.has(e.from) && byId.has(e.to)) adj.get(e.from).push({ to: e.to, i });
  });

  // DFS → classify back-edges (loops) so cyclic flows don't inflate the layout.
  const backSet = new Set();
  const state = new Map();
  const dfs = (u) => {
    state.set(u, 1);
    for (const { to, i } of adj.get(u) ?? []) {
      const s = state.get(to);
      if (s === 1) backSet.add(i);
      else if (s == null) dfs(to);
    }
    state.set(u, 2);
  };
  if (start) dfs(start.id);
  for (const n of nodes) if (state.get(n.id) == null) dfs(n.id);

  const layer = new Map();
  if (start) layer.set(start.id, 0);
  for (let pass = 0; pass < nodes.length + 1; pass += 1) {
    edges.forEach((e, i) => {
      if (backSet.has(i) || !byId.has(e.from) || !byId.has(e.to)) return;
      const lf = layer.get(e.from);
      if (lf == null) return;
      const lt = layer.get(e.to);
      if (lt == null || lt < lf + 1) layer.set(e.to, lf + 1);
    });
  }
  let maxLayer = 0;
  for (const n of nodes) {
    if (!layer.has(n.id)) layer.set(n.id, 0);
    maxLayer = Math.max(maxLayer, layer.get(n.id));
  }
  const used = new Map();
  const slots = new Map();
  for (const n of [...nodes].sort((a, b) => a.seq - b.seq)) {
    const l = layer.get(n.id);
    const u = used.get(l) ?? 0;
    slots.set(n.id, u);
    used.set(l, u + 1);
  }
  let maxSlots = 0;
  for (const v of used.values()) maxSlots = Math.max(maxSlots, v);

  const pos = new Map();
  for (const n of nodes) {
    pos.set(n.id, { x: PAD_LEFT + layer.get(n.id) * COL_W, y: PAD_TOP + slots.get(n.id) * ROW_H, layer: layer.get(n.id) });
  }
  return {
    pos,
    backSet,
    width: PAD_LEFT + (maxLayer + 1) * COL_W + 40,
    height: PAD_TOP + (maxSlots + 1) * ROW_H + 20,
  };
}

export function BpaGraph({ graph }) {
  const [sel, setSel] = useState(null);
  const [over, setOver] = useState({}); // dragged node position overrides
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);

  const base = useMemo(() => layoutGraph(graph.nodes, graph.edges), [graph]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const posOf = (id) => over[id] ?? base.pos.get(id);

  // Non-passive wheel zoom (towards the cursor).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const k = clamp(v.k * (e.deltaY < 0 ? 1.12 : 0.89), 0.4, 2.5);
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onMouseDown = (e) => {
    panRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };
  const onMouseMove = (e) => {
    if (dragRef.current) {
      const d = dragRef.current;
      const dx = (e.clientX - d.sx) / view.k;
      const dy = (e.clientY - d.sy) / view.k;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      setOver((o) => ({ ...o, [d.id]: { x: d.ox + dx, y: d.oy + dy, layer: d.layer } }));
    } else if (panRef.current) {
      const p = panRef.current;
      setView((v) => ({ ...v, x: p.vx + (e.clientX - p.x), y: p.vy + (e.clientY - p.y) }));
    }
  };
  const endInteraction = () => {
    panRef.current = null;
    dragRef.current = null;
  };
  const onNodeDown = (e, n) => {
    e.stopPropagation();
    const p = posOf(n.id);
    dragRef.current = { id: n.id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, layer: p.layer, moved: false };
  };
  const onNodeUp = (e, n) => {
    e.stopPropagation();
    if (dragRef.current && !dragRef.current.moved) setSel({ type: "node", key: n.id });
    dragRef.current = null;
  };

  const edges = graph.edges
    .map((e, i) => {
      const a = posOf(e.from);
      const b = posOf(e.to);
      if (!a || !b) return null;
      const backByLayer = (b.layer ?? 0) <= (a.layer ?? 0);
      return { ...e, i, a, b, back: base.backSet.has(i) || backByLayer };
    })
    .filter(Boolean);

  const selEdge = sel?.type === "edge" ? edges.find((e) => e.i === sel.key) : null;
  const selNode = sel?.type === "node" ? nodeById.get(sel.key) : null;
  const actions = (() => {
    if (!selEdge) return [];
    const list = graph.actionsByDecisionId[selEdge.decisionId];
    if (list?.length) return list;
    const one = graph.actionsByActionId[selEdge.actionId];
    return one ? [one] : [];
  })();
  const nodeEdges = selNode ? edges.filter((e) => e.from === selNode.id) : [];

  const edgePath = (e) => {
    if (e.back) {
      const fx = e.a.x + NODE_W / 2;
      const tx = e.b.x + NODE_W / 2;
      const topY = Math.min(e.a.y, e.b.y) - 40;
      return `M ${fx} ${e.a.y} C ${fx} ${topY}, ${tx} ${topY}, ${tx} ${e.b.y}`;
    }
    const x1 = e.a.x + NODE_W;
    const y1 = e.a.y + NODE_H / 2;
    const x2 = e.b.x;
    const y2 = e.b.y + NODE_H / 2;
    const c = Math.max(COL_W * 0.45, Math.abs(x2 - x1) * 0.5);
    return `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
  };
  const labelPos = (e) =>
    e.back
      ? { x: (e.a.x + e.b.x) / 2 + NODE_W / 2, y: Math.min(e.a.y, e.b.y) - 36 }
      : { x: (e.a.x + NODE_W + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 + NODE_H / 2 - 14 };

  return (
    <div className="cia-bpa-graph">
      <div
        className="cia-bpa-graph-canvas"
        ref={containerRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endInteraction}
        onMouseLeave={endInteraction}
      >
        <div className="cia-bpa-zoom">
          <button type="button" onClick={() => setView((v) => ({ ...v, k: clamp(v.k * 1.15, 0.4, 2.5) }))}>＋</button>
          <button type="button" onClick={() => setView((v) => ({ ...v, k: clamp(v.k * 0.87, 0.4, 2.5) }))}>－</button>
          <button type="button" onClick={() => { setView({ x: 0, y: 0, k: 1 }); setOver({}); }}>⟳</button>
        </div>
        <svg className="cia-bpa-svg" width="100%" height="100%">
          <defs>
            <marker id="bpa-arrow" markerWidth="11" markerHeight="11" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6 Z" fill="#7e8bb0" />
            </marker>
            <marker id="bpa-arrow-fwd" markerWidth="11" markerHeight="11" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6 Z" fill="#ff2d9b" />
            </marker>
            <marker id="bpa-arrow-back" markerWidth="11" markerHeight="11" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6 Z" fill="#f7a93b" />
            </marker>
            <pattern id="bpa-grid" width="26" height="26" patternUnits="userSpaceOnUse">
              <path d="M 26 0 L 0 0 0 26" fill="none" stroke="#223052" strokeWidth="0.6" />
              <circle cx="0" cy="0" r="1.1" fill="#33436b" />
            </pattern>
            <filter id="bpa-shadow" x="-40%" y="-40%" width="180%" height="200%">
              <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000000" floodOpacity="0.5" />
            </filter>
            <filter id="bpa-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2.4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect x="-4000" y="-4000" width="10000" height="10000" fill="url(#bpa-grid)" />

          <g transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
            {edges.map((e) => {
              const d = edgePath(e);
              const active = sel?.type === "edge" && sel.key === e.i;
              const lp = labelPos(e);
              const stroke = active ? "#ff2d9b" : e.back ? "#f7a93b" : "#5d6e9e";
              const marker = active ? "bpa-arrow-fwd" : e.back ? "bpa-arrow-back" : "bpa-arrow";
              return (
                <g
                  key={e.i}
                  className="cia-bpa-edge"
                  onMouseDown={(ev) => ev.stopPropagation()}
                  onClick={() => setSel({ type: "edge", key: e.i })}
                >
                  <path d={d} fill="none" stroke="transparent" strokeWidth="18" />
                  <path
                    className={active ? "cia-bpa-edge-active" : ""}
                    d={d}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={active ? 3.5 : 2.4}
                    strokeLinecap="round"
                    markerEnd={`url(#${marker})`}
                    filter={active || e.back ? "url(#bpa-glow)" : undefined}
                  />
                  {e.label ? (
                    <g transform={`translate(${lp.x}, ${lp.y})`}>
                      <rect
                        x={-(e.label.length * 3.4 + 9)}
                        y="-10"
                        width={e.label.length * 6.8 + 18}
                        height="20"
                        rx="10"
                        fill={active ? "#3a1430" : "#1b2233"}
                        stroke={active ? "#ff2d9b" : "#33436b"}
                      />
                      <text
                        x="0"
                        y="4"
                        fontSize="11"
                        textAnchor="middle"
                        fontWeight="600"
                        fill={active ? "#ff7cc2" : "#9fb0d8"}
                      >
                        {e.label}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}

            {graph.nodes.map((n) => {
              const p = posOf(n.id);
              if (!p) return null;
              const isEnd = n.icon === "end";
              const isStart = n.icon === "start";
              const active = sel?.type === "node" && sel.key === n.id;
              const accent = isStart ? "#39d98a" : isEnd ? "#8a93a6" : "#ff2d9b";
              const kind = isStart ? "START" : isEnd ? "END" : "TASK";
              const title = n.text || kind;
              return (
                <g
                  key={n.id}
                  className="cia-bpa-node"
                  transform={`translate(${p.x}, ${p.y})`}
                  onMouseDown={(e) => onNodeDown(e, n)}
                  onMouseUp={(e) => onNodeUp(e, n)}
                  filter="url(#bpa-shadow)"
                >
                  {/* body */}
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx="12"
                    fill="#161d2c"
                    stroke={active ? "#ffffff" : accent}
                    strokeWidth={active ? 2.4 : 1.4}
                  />
                  {/* coloured header */}
                  <path d={topRoundedPath(NODE_W, HEAD_H, 12)} fill={accent} opacity={active ? 1 : 0.92} />
                  <text x="12" y={HEAD_H / 2 + 4} fontSize="12.5" fontWeight="700" fill="#0c0f17">
                    <tspan>{ICON[n.icon] ?? "•"} </tspan>
                    {title.length > 22 ? `${title.slice(0, 21)}…` : title}
                  </text>
                  {/* body label */}
                  <text x="14" y={HEAD_H + 24} fontSize="11" fontWeight="600" fill="#8ea0c8">
                    {kind}
                  </text>
                  {/* connection pins */}
                  {!isStart ? (
                    <circle cx="0" cy={NODE_H / 2} r="5" fill="#0c0f17" stroke={accent} strokeWidth="2" />
                  ) : null}
                  {!isEnd ? (
                    <circle cx={NODE_W} cy={NODE_H / 2} r="5" fill={accent} stroke="#0c0f17" strokeWidth="1.5" />
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
        <div className="cia-bpa-graph-hint">Scroll to zoom · drag canvas to pan · drag a task to move it</div>
      </div>

      <aside className="cia-bpa-graph-panel">
        {selEdge ? (
          <>
            <div className="cia-bpa-graph-panel-title">Decision Actions</div>
            <div className="cia-bpa-graph-panel-head">
              <span className="cia-bpa-chip">{selEdge.label || "(decision)"}</span>
              {selEdge.isDefault ? <span className="cia-bpa-graph-default">default</span> : null}
              {selEdge.expected ? <span className="cia-bpa-graph-expected">expected</span> : null}
            </div>
            <dl className="cia-bpa-graph-meta">
              <div>
                <dt>Decision</dt>
                <dd>{selEdge.label || "—"}</dd>
              </div>
              <div>
                <dt>Route</dt>
                <dd>
                  {nodeById.get(selEdge.from)?.text} → {nodeById.get(selEdge.to)?.text}
                </dd>
              </div>
              <div>
                <dt>Decision Id</dt>
                <dd className="cia-bpa-graph-mono">{selEdge.decisionId || "—"}</dd>
              </div>
            </dl>
            <h4>Actions{actions.length ? ` (${actions.length})` : ""}</h4>
            {actions.length ? (
              <ol className="cia-bpa-graph-actions">
                {actions.map((a, i) => (
                  <li key={`${a.actionId}-${i}`} className="cia-bpa-graph-action">
                    <div className="cia-bpa-graph-action-top">
                      <span className="cia-bpa-graph-seq">{a.sequence || (i + 1) * 10}</span>
                      <span className="cia-bpa-graph-type" title={a.type}>
                        {actionTypeLabel(a.type)}
                      </span>
                    </div>
                    <div className="cia-bpa-graph-action-desc">
                      {a.description || a.decision || "(no description)"}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="cia-forum-muted">No action detail recorded for this connection.</p>
            )}
            <p className="cia-bpa-graph-foot">
              Actions run lowest → highest sequence. Per T1 guidance, Assignments sequence early and a
              Trigger Task to an End task sequences last.
            </p>
          </>
        ) : selNode ? (
          <>
            <div className="cia-bpa-graph-panel-head">
              <span className="cia-bpa-chip">{selNode.text}</span>
            </div>
            <h4>Decisions from this task</h4>
            {nodeEdges.length ? (
              <ul className="cia-bpa-graph-actions">
                {nodeEdges.map((e) => (
                  <li key={e.i} className="cia-bpa-graph-declink" onClick={() => setSel({ type: "edge", key: e.i })}>
                    <strong>
                      {e.label || "(decision)"}
                      {e.isDefault ? <span className="cia-bpa-graph-default">default</span> : null}
                    </strong>
                    <span>→ {nodeById.get(e.to)?.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cia-forum-muted">This task has no outgoing decisions.</p>
            )}
          </>
        ) : (
          <p className="cia-forum-muted">Click a task or connection. Scroll to zoom, drag to pan.</p>
        )}
      </aside>
    </div>
  );
}

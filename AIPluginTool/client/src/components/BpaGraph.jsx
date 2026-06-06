import { useMemo, useState } from "react";

const NODE_W = 190;
const NODE_H = 50;
const COL_W = 250;
const ROW_H = 104;
const PAD_TOP = 70;
const PAD_LEFT = 24;
const ICON = { start: "▶", end: "■", user: "👤" };

// Assign each node a layer (x) via longest-path over the *acyclic* edges, with
// back-edges (loops) detected by DFS so cycles don't inflate the layout. Returns
// positions plus the set of back-edge indices.
function layoutGraph(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start =
    nodes.find((n) => n.icon === "start") ??
    [...nodes].sort((a, b) => a.seq - b.seq)[0];

  // Adjacency with edge indices.
  const adj = new Map(nodes.map((n) => [n.id, []]));
  edges.forEach((e, i) => {
    if (adj.has(e.from) && byId.has(e.to)) adj.get(e.from).push({ to: e.to, i });
  });

  // DFS to classify back-edges (target currently on the recursion stack).
  const backSet = new Set();
  const state = new Map(); // 1 = on stack, 2 = done
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

  // Longest-path layering over forward (non-back) edges only — now acyclic.
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
  // Slot within each layer (preserve sequence order).
  const slots = new Map();
  const perLayer = new Map();
  for (const n of [...nodes].sort((a, b) => a.seq - b.seq)) {
    const l = layer.get(n.id);
    const used = perLayer.get(l) ?? 0;
    slots.set(n.id, used);
    perLayer.set(l, used + 1);
  }
  let maxSlots = 0;
  for (const v of perLayer.values()) maxSlots = Math.max(maxSlots, v);

  const pos = new Map();
  for (const n of nodes) {
    pos.set(n.id, {
      x: PAD_LEFT + layer.get(n.id) * COL_W,
      y: PAD_TOP + slots.get(n.id) * ROW_H,
      layer: layer.get(n.id),
    });
  }
  return {
    pos,
    layer,
    backSet,
    width: PAD_LEFT + (maxLayer + 1) * COL_W + 40,
    height: PAD_TOP + maxSlots * ROW_H + 40,
  };
}

export function BpaGraph({ graph }) {
  const [sel, setSel] = useState(null); // {type:'edge'|'node', key}

  const L = useMemo(() => layoutGraph(graph.nodes, graph.edges), [graph]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);

  const edges = graph.edges.map((e, i) => {
    const a = L.pos.get(e.from);
    const b = L.pos.get(e.to);
    if (!a || !b) return null;
    const back = L.backSet.has(i) || b.layer <= a.layer;
    return { ...e, i, a, b, back };
  }).filter(Boolean);

  const selEdge = sel?.type === "edge" ? edges.find((e) => e.i === sel.key) : null;
  const selNode = sel?.type === "node" ? nodeById.get(sel.key) : null;
  const action = selEdge
    ? graph.actionsByActionId[selEdge.actionId] || graph.actionsByDecisionId[selEdge.decisionId] || null
    : null;
  const nodeEdges = selNode ? edges.filter((e) => e.from === selNode.id) : [];

  const edgePath = (e) => {
    if (e.back) {
      const fx = e.a.x + NODE_W / 2;
      const tx = e.b.x + NODE_W / 2;
      const topY = Math.min(e.a.y, e.b.y) - 34;
      return `M ${fx} ${e.a.y} C ${fx} ${topY}, ${tx} ${topY}, ${tx} ${e.b.y}`;
    }
    const x1 = e.a.x + NODE_W;
    const y1 = e.a.y + NODE_H / 2;
    const x2 = e.b.x;
    const y2 = e.b.y + NODE_H / 2;
    const c = COL_W * 0.4;
    return `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
  };

  const labelPos = (e) => {
    if (e.back) return { x: (e.a.x + e.b.x) / 2 + NODE_W / 2, y: Math.min(e.a.y, e.b.y) - 30 };
    return { x: (e.a.x + NODE_W + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 + NODE_H / 2 - 12 };
  };

  return (
    <div className="cia-bpa-graph">
      <div className="cia-bpa-graph-canvas">
        <svg width={L.width} height={L.height} role="img" aria-label="BPA flow">
          <defs>
            <marker id="bpa-arrow" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6 Z" fill="#9b8cab" />
            </marker>
            <marker id="bpa-arrow-sel" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6 Z" fill="#e4007c" />
            </marker>
          </defs>

          {edges.map((e) => {
            const d = edgePath(e);
            const active = sel?.type === "edge" && sel.key === e.i;
            const lp = labelPos(e);
            return (
              <g key={e.i} className="cia-bpa-edge" onClick={() => setSel({ type: "edge", key: e.i })}>
                {/* wide invisible hit area */}
                <path d={d} fill="none" stroke="transparent" strokeWidth="14" />
                <path
                  d={d}
                  fill="none"
                  stroke={active ? "#e4007c" : e.back ? "#f7941d" : "#c9bcd6"}
                  strokeWidth={active ? 2.5 : 1.6}
                  markerEnd={`url(#${active ? "bpa-arrow-sel" : "bpa-arrow"})`}
                />
                {e.label ? (
                  <g transform={`translate(${lp.x}, ${lp.y})`}>
                    <rect
                      x={-(e.label.length * 3.3 + 8)}
                      y="-9"
                      width={e.label.length * 6.6 + 16}
                      height="18"
                      rx="9"
                      fill={active ? "#fde8f3" : "#ffffff"}
                      stroke={active ? "#e4007c" : "#e8dff0"}
                    />
                    <text x="0" y="4" fontSize="11" textAnchor="middle" fill={active ? "#e4007c" : "#6f5f82"}>
                      {e.label}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}

          {graph.nodes.map((n) => {
            const p = L.pos.get(n.id);
            if (!p) return null;
            const isEnd = n.icon === "end";
            const isStart = n.icon === "start";
            const active = sel?.type === "node" && sel.key === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${p.x}, ${p.y})`}
                className="cia-bpa-node"
                onClick={() => setSel({ type: "node", key: n.id })}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx="12"
                  fill={active ? "#fff5fa" : "#ffffff"}
                  stroke={isStart ? "#16a34a" : isEnd ? "#64748b" : "#e4007c"}
                  strokeWidth={active ? 2.5 : 1.5}
                />
                <text x="13" y={NODE_H / 2 + 4} fontSize="12.5" fontWeight="600" fill="#2a1446">
                  <tspan>{ICON[n.icon] ?? "•"} </tspan>
                  {n.text.length > 24 ? `${n.text.slice(0, 23)}…` : n.text}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <aside className="cia-bpa-graph-panel">
        {selEdge ? (
          <>
            <div className="cia-bpa-graph-panel-head">
              <span className="cia-bpa-chip">{selEdge.label || "(decision)"}</span>
              {selEdge.expected ? <span className="cia-bpa-graph-expected">expected</span> : null}
            </div>
            <p className="cia-bpa-graph-route">
              {nodeById.get(selEdge.from)?.text} → {nodeById.get(selEdge.to)?.text}
            </p>
            <h4>Action within this decision</h4>
            {action ? (
              <ul className="cia-bpa-graph-actions">
                <li>
                  <strong>{action.type || "Action"}</strong>
                  <span>{action.description || action.decision}</span>
                </li>
              </ul>
            ) : (
              <p className="cia-forum-muted">No action detail recorded for this connection.</p>
            )}
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
                  <li
                    key={e.i}
                    className="cia-bpa-graph-declink"
                    onClick={() => setSel({ type: "edge", key: e.i })}
                  >
                    <strong>{e.label || "(decision)"}</strong>
                    <span>→ {nodeById.get(e.to)?.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cia-forum-muted">This task has no outgoing decisions.</p>
            )}
          </>
        ) : (
          <p className="cia-forum-muted">Click a task or a connection to inspect it.</p>
        )}
      </aside>
    </div>
  );
}

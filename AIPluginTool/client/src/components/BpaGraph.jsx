import { useMemo, useState } from "react";

const NODE_W = 240;
const NODE_H = 46;
const ROW = 96;
const TOP = 30;
const LEFT = 40;
const ICON = { start: "▶", end: "■", user: "👤" };

// Interactive flow graph: task nodes in sequence, decision connections drawn as
// labelled arcs. Click an edge (decision) to see the action within it.
export function BpaGraph({ graph }) {
  const [selected, setSelected] = useState(null);

  const layout = useMemo(() => {
    const nodes = [...graph.nodes].sort((a, b) => a.seq - b.seq);
    const yOf = new Map();
    nodes.forEach((n, i) => yOf.set(n.id, TOP + i * ROW));
    const rightX = LEFT + NODE_W;
    const maxBulge = Math.max(...graph.edges.map(() => 1), 1);
    let widest = LEFT + NODE_W + 60;
    const edges = graph.edges.map((e, i) => {
      const y1 = (yOf.get(e.from) ?? TOP) + NODE_H / 2;
      const y2 = (yOf.get(e.to) ?? TOP) + NODE_H / 2;
      const back = y2 <= y1; // loop / revise
      const dist = Math.abs((yOf.get(e.to) ?? 0) - (yOf.get(e.from) ?? 0));
      const bulge = 40 + Math.min(dist / ROW, 6) * 22 + (back ? 26 : 0);
      widest = Math.max(widest, rightX + bulge + 80);
      return { ...e, i, y1, y2, rightX, bulge, back };
    });
    void maxBulge;
    const height = TOP + nodes.length * ROW;
    return { nodes, yOf, edges, width: widest, height };
  }, [graph]);

  const sel = selected != null ? layout.edges.find((e) => e.i === selected) : null;
  const action = sel
    ? graph.actionsByActionId[sel.actionId] || graph.actionsByDecisionId[sel.decisionId] || null
    : null;

  return (
    <div className="cia-bpa-graph">
      <div className="cia-bpa-graph-canvas">
        <svg width={layout.width} height={layout.height} role="img" aria-label="BPA flow">
          <defs>
            <marker id="bpa-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
              <path d="M0,0 L7,3 L0,6 Z" fill="#9b8cab" />
            </marker>
            <marker id="bpa-arrow-sel" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
              <path d="M0,0 L7,3 L0,6 Z" fill="#e4007c" />
            </marker>
          </defs>

          {/* edges */}
          {layout.edges.map((e) => {
            const cx = e.rightX + e.bulge;
            const my = (e.y1 + e.y2) / 2;
            const d = `M ${e.rightX} ${e.y1} C ${cx} ${e.y1}, ${cx} ${e.y2}, ${e.rightX} ${e.y2}`;
            const active = selected === e.i;
            return (
              <g key={e.i} className="cia-bpa-edge" onClick={() => setSelected(e.i)}>
                <path
                  d={d}
                  fill="none"
                  stroke={active ? "#e4007c" : e.back ? "#f7941d" : "#c9bcd6"}
                  strokeWidth={active ? 2.5 : 1.5}
                  markerEnd={`url(#${active ? "bpa-arrow-sel" : "bpa-arrow"})`}
                />
                {e.label ? (
                  <g transform={`translate(${cx - 4}, ${my})`}>
                    <rect x="-6" y="-9" width={e.label.length * 6.4 + 12} height="18" rx="9"
                      fill={active ? "#fde8f3" : "#ffffff"} stroke={active ? "#e4007c" : "#e8dff0"} />
                    <text x="0" y="4" fontSize="11" fill={active ? "#e4007c" : "#6f5f82"}>
                      {e.label}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}

          {/* nodes */}
          {layout.nodes.map((n) => {
            const y = layout.yOf.get(n.id);
            const isEnd = n.icon === "end";
            const isStart = n.icon === "start";
            return (
              <g key={n.id} transform={`translate(${LEFT}, ${y})`}>
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx="12"
                  fill="#ffffff"
                  stroke={isStart ? "#16a34a" : isEnd ? "#64748b" : "#e4007c"}
                  strokeWidth="1.5"
                />
                <text x="14" y={NODE_H / 2 + 4} fontSize="13" fontWeight="600" fill="#2a1446">
                  <tspan>{ICON[n.icon] ?? "•"} </tspan>
                  {n.text.length > 30 ? `${n.text.slice(0, 29)}…` : n.text}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <aside className="cia-bpa-graph-panel">
        {sel ? (
          <>
            <div className="cia-bpa-graph-panel-head">
              <span className="cia-bpa-chip">{sel.label || "(decision)"}</span>
              {sel.expected ? <span className="cia-bpa-graph-expected">expected</span> : null}
            </div>
            <p className="cia-bpa-graph-route">
              {layout.nodes.find((n) => n.id === sel.from)?.text} →{" "}
              {layout.nodes.find((n) => n.id === sel.to)?.text}
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
        ) : (
          <p className="cia-forum-muted">Click a connection to see the decision&apos;s action.</p>
        )}
      </aside>
    </div>
  );
}

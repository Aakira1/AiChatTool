import { useState } from "react";
import { CiaInsightsPanel } from "./CiaInsightsPanel.jsx";
import { TerminologyGlossary } from "./TerminologyGlossary.jsx";

export function CiaSidePanel({ insights, artifacts, onAskTerm, collapsed = false, onToggleCollapsed }) {
  const [tab, setTab] = useState("insights");

  if (collapsed) {
    return (
      <aside className="cia-insights cia-insights-collapsed">
        <button
          type="button"
          className="cia-collapse-rail-btn"
          onClick={onToggleCollapsed}
          title="Expand insights"
          aria-label="Expand insights"
        >
          <span aria-hidden="true">«</span>
          <span className="cia-collapse-rail-label">Insights</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="cia-insights">
      <div className="cia-side-tabs">
        <button
          type="button"
          className="cia-collapse-btn"
          onClick={onToggleCollapsed}
          title="Collapse insights"
          aria-label="Collapse insights"
        >
          »
        </button>
        <button
          type="button"
          className={tab === "insights" ? "active" : ""}
          onClick={() => setTab("insights")}
        >
          Insights
        </button>
        <button
          type="button"
          className={tab === "glossary" ? "active" : ""}
          onClick={() => setTab("glossary")}
        >
          Glossary
        </button>
      </div>

      {tab === "insights" ? (
        <CiaInsightsPanel insights={insights} artifacts={artifacts} embedded />
      ) : (
        <TerminologyGlossary onAsk={onAskTerm} />
      )}
    </aside>
  );
}

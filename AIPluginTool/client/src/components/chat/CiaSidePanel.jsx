import { useState } from "react";
import { CiaInsightsPanel } from "./CiaInsightsPanel.jsx";
import { TerminologyGlossary } from "./TerminologyGlossary.jsx";

export function CiaSidePanel({ insights, onAskTerm }) {
  const [tab, setTab] = useState("insights");

  return (
    <aside className="cia-insights">
      <div className="cia-side-tabs">
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
        <CiaInsightsPanel insights={insights} embedded />
      ) : (
        <TerminologyGlossary onAsk={onAskTerm} />
      )}
    </aside>
  );
}

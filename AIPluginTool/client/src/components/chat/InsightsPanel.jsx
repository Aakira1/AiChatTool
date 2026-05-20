export function InsightsPanel({ insights }) {
  if (!insights) {
    return null;
  }

  return (
    <aside className="w-80 border-l border-slate-700 bg-slate-900/60 p-4 text-sm">
      <h3 className="mb-3 font-semibold text-slate-200">AI Insights</h3>
      <p className="mb-3 text-slate-300">
        Confidence: <span className="text-cyan-300">{insights.confidence}%</span>
      </p>

      <section className="mb-4">
        <h4 className="mb-2 text-xs uppercase tracking-wide text-slate-500">Likely Outcomes</h4>
        <ul className="space-y-2">
          {(insights.likelyOutcomes ?? []).map((item) => (
            <li key={item.resolution} className="rounded bg-slate-800 p-2">
              <p>{item.resolution}</p>
              <p className="text-xs text-slate-400">{item.confidence}% confidence</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-4">
        <h4 className="mb-2 text-xs uppercase tracking-wide text-slate-500">Sources</h4>
        <ul className="space-y-1 text-xs text-slate-300">
          {(insights.sources ?? []).map((source) => (
            <li key={`${source.source}-${source.caseId}`}>
              [{source.source}] {source.caseId} ({source.status})
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="mb-2 text-xs uppercase tracking-wide text-slate-500">Related Cases</h4>
        <ul className="space-y-2">
          {(insights.relatedCases ?? []).map((item) => (
            <li key={`${item.source}-${item.caseId}`} className="rounded bg-slate-800 p-2 text-xs">
              <p className="font-medium">
                [{item.source}] {item.caseId}
              </p>
              <p className="text-slate-400">{item.resolution}</p>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

export function CiaInsightsPanel({ insights, embedded = false }) {
  if (!insights) {
    return (
      <div className={embedded ? "cia-insights-embedded" : "cia-insights"}>
        {!embedded ? (
          <>
            <h2>AI Insights</h2>
            <p className="text-sm text-[var(--t1-muted)]">Sources, confidence, and related context</p>
          </>
        ) : null}
        <div className="mt-8 text-center text-sm text-[var(--t1-muted)]">
          <div className="text-3xl opacity-40">💡</div>
          Insights will appear here as the AI reviews stored case data.
        </div>
      </div>
    );
  }

  const sources = insights.sources ?? [];
  const relatedCases = insights.relatedCases ?? [];

  return (
    <div className={embedded ? "cia-insights-embedded" : "cia-insights"}>
      {!embedded ? (
        <>
          <h2>AI Insights</h2>
          <p className="text-sm text-[var(--t1-muted)]">
            Reviewed from Vectorize knowledge, CI/CIA records, and glossary
          </p>
        </>
      ) : null}

      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--t1-muted)]">
          AI Confidence
        </p>
        <p className="cia-confidence">{insights.confidence}%</p>
        <p className="text-xs text-[var(--t1-muted)]">match quality</p>
        <div className="cia-confidence-bar mt-2">
          <div className="cia-confidence-fill" style={{ width: `${insights.confidence}%` }} />
        </div>
      </section>

      {sources.length > 0 ? (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--t1-muted)]">
            Sources ({sources.length})
          </p>
          {sources.map((source) => (
            <div key={`${source.title}-${source.meta}`} className="cia-source-item mt-2">
              <strong className="block text-[var(--t1-navy)]">{source.title}</strong>
              <span className="text-xs text-[var(--t1-muted)]">{source.meta}</span>
            </div>
          ))}
        </section>
      ) : null}

      {relatedCases.length > 0 ? (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--t1-muted)]">
            Related Cases
          </p>
          {relatedCases.map((item) => (
            <div key={`${item.source}-${item.id}`} className="cia-case-link mt-2">
              <div className="cia-case-id">{item.id}</div>
              <div className="text-sm text-[var(--t1-navy)]">{item.title}</div>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

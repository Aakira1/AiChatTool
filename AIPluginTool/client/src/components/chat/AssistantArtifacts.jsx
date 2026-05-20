import ReactMarkdown from "react-markdown";

export function AssistantArtifacts({ content, artifacts }) {
  return (
    <div>
      {content ? (
        <div className="prose prose-sm max-w-none text-[var(--t1-navy)]">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      ) : null}

      {artifacts?.comparison ? (
        <div className="cia-term-card">
          <div>
            <div className="cia-term-label">{artifacts.comparison.ciLabel}</div>
            <div className="cia-term-value">{artifacts.comparison.ciValue}</div>
          </div>
          <div className="cia-term-arrow">→</div>
          <div>
            <div className="cia-term-label">{artifacts.comparison.ciaLabel}</div>
            <div className="cia-term-value">{artifacts.comparison.ciaValue}</div>
          </div>
        </div>
      ) : null}

      {artifacts?.metricsCharts?.length > 0 ? (
        <div className="cia-metric-chart">
          {artifacts.metricsCharts.map((metric) => {
            const max = Math.max(metric.ci, metric.cia, 1);
            return (
              <div key={metric.label}>
                <div className="cia-metric-row">
                  <span>{metric.label}</span>
                  <div className="cia-metric-bar-wrap">
                    <div className="cia-metric-bar ci" style={{ width: `${(metric.ci / max) * 100}%` }} />
                  </div>
                  <div className="cia-metric-bar-wrap">
                    <div className="cia-metric-bar cia" style={{ width: `${(metric.cia / max) * 100}%` }} />
                  </div>
                </div>
                <div className="cia-metric-row text-[var(--t1-muted)]">
                  <span />
                  <span>CI: {metric.ci}</span>
                  <span>CIA: {metric.cia}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {artifacts?.validation ? (
        <div className="mt-3 text-sm">
          <p>
            ✅ <strong>{artifacts.validation.matched} controls matched</strong> source ↔ target
          </p>
          <p className="mt-1">
            ⚠️ <strong>{artifacts.validation.discrepancies} discrepancies found</strong>
          </p>
          <ul className="mt-2 list-disc pl-5">
            {artifacts.validation.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {artifacts?.bulletPoints?.length > 0 ? (
        <ul className="mt-3 list-disc pl-5 text-sm">
          {artifacts.bulletPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      ) : null}

      {artifacts?.caseLinks?.length > 0 ? (
        <div className="mt-2">
          {artifacts.caseLinks.map((item) => (
            <div key={`${item.source}-${item.id}`} className="cia-case-link">
              <div className="cia-case-id">{item.id}</div>
              <div className="text-sm text-[var(--t1-navy)]">{item.title}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

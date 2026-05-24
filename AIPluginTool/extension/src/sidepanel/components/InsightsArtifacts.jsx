import { useState } from "react";

function summarise(artifacts) {
  if (!artifacts) return "";
  if (artifacts.headline) return artifacts.headline;
  if (artifacts.comparison) return "CI ↔ CiA comparison";
  return "View details";
}

function MetricRow({ metric }) {
  const max = Math.max(metric.ci, metric.cia, 1);
  const delta = metric.delta ?? 0;
  const tone =
    delta === 0 ? "neutral" : (metric.higherIsBetter ? delta > 0 : delta < 0) ? "positive" : "negative";

  return (
    <div className="cia-ext-metric-block">
      <div className="cia-ext-metric-head">
        <span>{metric.label}</span>
        <span className={`cia-ext-metric-delta ${tone}`}>
          {delta === 0 ? "Even" : `${delta > 0 ? "+" : ""}${delta}`}
        </span>
      </div>
      <div className="cia-ext-metric-row">
        <span className="ci">CI</span>
        <div className="cia-ext-bar-wrap">
          <div className="cia-ext-bar ci" style={{ width: `${(metric.ci / max) * 100}%` }} />
        </div>
        <span>{metric.ci}</span>
      </div>
      <div className="cia-ext-metric-row">
        <span className="cia">CiA</span>
        <div className="cia-ext-bar-wrap">
          <div className="cia-ext-bar cia" style={{ width: `${(metric.cia / max) * 100}%` }} />
        </div>
        <span>{metric.cia}</span>
      </div>
    </div>
  );
}

export function InsightsArtifacts({ artifacts }) {
  const [expanded, setExpanded] = useState(false);

  if (!artifacts) return null;

  const hasContent =
    artifacts.headline ||
    artifacts.takeaways?.length ||
    artifacts.comparison ||
    artifacts.metricsCharts?.length ||
    artifacts.caseLinks?.length;

  if (!hasContent) return null;

  return (
    <div className={`cia-ext-artifacts ${expanded ? "expanded" : ""}`}>
      <button
        type="button"
        className="cia-ext-artifacts-toggle"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span aria-hidden="true">📊</span>
        <span className="cia-ext-artifacts-label">
          <strong>{expanded ? "Insights" : "Show insights"}</strong>
          <small>{summarise(artifacts)}</small>
        </span>
        <span className={`cia-ext-artifacts-chevron ${expanded ? "open" : ""}`}>▾</span>
      </button>

      {expanded ? (
        <div className="cia-ext-artifacts-body">
          {artifacts.headline ? <p className="cia-ext-insights-headline">{artifacts.headline}</p> : null}
          {artifacts.takeaways?.length > 0 ? (
            <ul className="cia-ext-takeaways">
              {artifacts.takeaways.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {artifacts.comparison ? (
            <div className="cia-ext-term-card">
              <div>
                <small>{artifacts.comparison.ciLabel}</small>
                <div>{artifacts.comparison.ciValue}</div>
              </div>
              <span>→</span>
              <div>
                <small>{artifacts.comparison.ciaLabel}</small>
                <div>{artifacts.comparison.ciaValue}</div>
              </div>
            </div>
          ) : null}
          {artifacts.metricsCharts?.map((metric) => (
            <MetricRow key={metric.label} metric={metric} />
          ))}
          {artifacts.caseLinks?.length > 0 ? (
            <div className="cia-ext-case-links">
              {artifacts.caseLinks.map((item) => (
                <div key={`${item.source}-${item.id}`} className="cia-ext-case-link">
                  <strong>
                    {item.source?.toUpperCase()} · {item.id}
                  </strong>
                  <span>{item.title}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

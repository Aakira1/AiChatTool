import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getSettings, subscribeSettings } from "../../lib/settings.js";

function isRich(artifacts) {
  if (!artifacts) return false;
  return Boolean(
    artifacts.comparison ||
      artifacts.metricsCharts?.length ||
      artifacts.validation ||
      (artifacts.bulletPoints?.length ?? 0) > 0 ||
      (artifacts.caseLinks?.length ?? 0) > 0,
  );
}

/**
 * Heuristic for whether to auto-expand the rich artifact panel.
 * Auto-expands when the answer is clearly analytical (comparison + numbers + linked cases).
 * Otherwise we collapse so generic Q&A doesn't get crowded.
 */
function shouldAutoExpand(artifacts) {
  if (!artifacts) return false;
  let score = 0;
  if (artifacts.comparison) score += 2;
  if ((artifacts.metricsCharts?.length ?? 0) > 0) score += 2;
  if ((artifacts.caseLinks?.length ?? 0) >= 2) score += 1;
  if (artifacts.validation) score += 2;
  // Bullet points alone aren't rich enough to auto-expand.
  return score >= 3;
}

function summarise(artifacts) {
  if (!artifacts) return "";
  const parts = [];
  if (artifacts.comparison) parts.push("comparison");
  if ((artifacts.metricsCharts?.length ?? 0) > 0) {
    parts.push(`${artifacts.metricsCharts.length} metric${artifacts.metricsCharts.length === 1 ? "" : "s"}`);
  }
  if ((artifacts.caseLinks?.length ?? 0) > 0) {
    parts.push(`${artifacts.caseLinks.length} case${artifacts.caseLinks.length === 1 ? "" : "s"}`);
  }
  if (artifacts.validation) parts.push("validation");
  if ((artifacts.bulletPoints?.length ?? 0) > 0) parts.push("notes");
  return parts.join(" · ");
}

export function AssistantArtifacts({ content, artifacts }) {
  const rich = useMemo(() => isRich(artifacts), [artifacts]);
  const [forceShow, setForceShow] = useState(() => Boolean(getSettings().showArtifactsByDefault));
  useEffect(() => {
    return subscribeSettings((next) => setForceShow(Boolean(next.showArtifactsByDefault)));
  }, []);
  const auto = useMemo(
    () => forceShow || shouldAutoExpand(artifacts),
    [forceShow, artifacts],
  );
  const [expanded, setExpanded] = useState(auto);
  useEffect(() => {
    setExpanded(auto);
  }, [auto]);

  return (
    <div>
      {content ? (
        <div className="prose prose-sm max-w-none text-[var(--t1-navy)]">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      ) : null}

      {rich ? (
        <div className={`cia-artifacts ${expanded ? "expanded" : "collapsed"}`}>
          <button
            type="button"
            className="cia-artifacts-toggle"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-controls="cia-artifacts-body"
          >
            <span className="cia-artifacts-toggle-icon" aria-hidden="true">
              📊
            </span>
            <span className="cia-artifacts-toggle-text">
              <strong>{expanded ? "Insights" : "Show insights"}</strong>
              <span className="cia-artifacts-toggle-meta">{summarise(artifacts)}</span>
            </span>
            <span className={`cia-artifacts-chevron ${expanded ? "open" : ""}`} aria-hidden="true">
              ▾
            </span>
          </button>

          {expanded ? (
            <div className="cia-artifacts-body" id="cia-artifacts-body">
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
                            <div
                              className="cia-metric-bar ci"
                              style={{ width: `${(metric.ci / max) * 100}%` }}
                            />
                          </div>
                          <div className="cia-metric-bar-wrap">
                            <div
                              className="cia-metric-bar cia"
                              style={{ width: `${(metric.cia / max) * 100}%` }}
                            />
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
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

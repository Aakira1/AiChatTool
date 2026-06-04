import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getSettings, subscribeSettings } from "../../lib/settings.js";
import { parseFileBlocks, hasMarkdownTable, deriveFileTitle } from "../../lib/fileBlocks.js";
import { FileDownloadCard } from "./FileDownloadCard.jsx";

function isRich(artifacts) {
  if (!artifacts) return false;
  return Boolean(
    artifacts.comparison ||
      artifacts.metricsCharts?.length ||
      artifacts.validation ||
      artifacts.headline ||
      (artifacts.takeaways?.length ?? 0) > 0 ||
      (artifacts.bulletPoints?.length ?? 0) > 0 ||
      (artifacts.caseLinks?.length ?? 0) > 0,
  );
}

function summarise(artifacts) {
  if (!artifacts) return "";
  if (artifacts.headline) return artifacts.headline;
  const parts = [];
  if (artifacts.comparison) parts.push("CI ↔ CiA");
  if ((artifacts.metricsCharts?.length ?? 0) > 0) {
    parts.push(`${artifacts.metricsCharts.length} metrics`);
  }
  if ((artifacts.caseLinks?.length ?? 0) > 0) {
    parts.push(`${artifacts.caseLinks.length} related cases`);
  }
  if (artifacts.validation) parts.push("validation");
  return parts.join(" · ") || "details";
}

function formatDelta(delta, { higherIsBetter = false, suffix = "" } = {}) {
  if (delta === 0 || delta == null) return { text: "Even", tone: "neutral" };
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  const sign = delta > 0 ? "+" : "";
  return {
    text: `${sign}${delta}${suffix}`,
    tone: improved ? "positive" : "negative",
  };
}

function MetricRow({ metric }) {
  const max = Math.max(metric.ci, metric.cia, 1);
  const delta = formatDelta(metric.delta, {
    higherIsBetter: metric.higherIsBetter,
    suffix: metric.label.includes("%") ? " pts" : "",
  });

  return (
    <div className="cia-metric-block">
      <div className="cia-metric-block-head">
        <span className="cia-metric-block-label">{metric.label}</span>
        <span className={`cia-metric-delta ${delta.tone}`}>{delta.text}</span>
      </div>
      <div className="cia-metric-dual">
        <div className="cia-metric-track">
          <span className="cia-metric-tag ci">CI</span>
          <div className="cia-metric-bar-wrap">
            <div className="cia-metric-bar ci" style={{ width: `${(metric.ci / max) * 100}%` }} />
          </div>
          <span className="cia-metric-num">{metric.ci}</span>
        </div>
        <div className="cia-metric-track">
          <span className="cia-metric-tag cia">CiA</span>
          <div className="cia-metric-bar-wrap">
            <div className="cia-metric-bar cia" style={{ width: `${(metric.cia / max) * 100}%` }} />
          </div>
          <span className="cia-metric-num">{metric.cia}</span>
        </div>
      </div>
    </div>
  );
}

export function AssistantArtifacts({ content, artifacts }) {
  const rich = useMemo(() => isRich(artifacts), [artifacts]);
  const [showInsights, setShowInsights] = useState(() => getSettings().showInsights !== false);
  const [expanded, setExpanded] = useState(() => Boolean(getSettings().showArtifactsByDefault));

  useEffect(() => {
    return subscribeSettings((next) => {
      setShowInsights(next.showInsights !== false);
      if (next.showArtifactsByDefault) {
        setExpanded(true);
      }
    });
  }, []);

  const collapsedHint = summarise(artifacts);
  const { text, files, pending } = useMemo(() => parseFileBlocks(content), [content]);

  // Fallback: the model often describes a spreadsheet in prose + markdown tables
  // instead of emitting a clean ```spreadsheet JSON block. If there's no explicit
  // file spec but the reply contains a markdown table, offer a content-based
  // download (server parses the tables into a real .xlsx).
  const fallbackFiles = useMemo(() => {
    if (pending || files.length) return [];
    if (!hasMarkdownTable(text)) return [];
    return [{ title: deriveFileTitle(content), content }];
  }, [pending, files.length, text, content]);

  const allFiles = files.length ? files : fallbackFiles;

  return (
    <div>
      {text ? (
        <div className="prose prose-sm max-w-none text-[var(--t1-navy)]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      ) : null}

      {pending ? (
        <div className="cia-file-card cia-file-card-pending">
          <div className="cia-file-icon" aria-hidden="true">
            XLS
          </div>
          <div className="cia-file-meta">
            <div className="cia-file-name">Generating file…</div>
            <div className="cia-file-sub">Preparing your spreadsheet</div>
          </div>
          <span className="cia-file-spinner" aria-hidden="true" />
        </div>
      ) : null}

      {allFiles.map((spec, index) => (
        <FileDownloadCard key={`${spec.title}-${index}`} spec={spec} />
      ))}

      {showInsights && rich ? (
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
              <span className="cia-artifacts-toggle-meta" title={collapsedHint}>
                {collapsedHint}
              </span>
            </span>
            <span className={`cia-artifacts-chevron ${expanded ? "open" : ""}`} aria-hidden="true">
              ▾
            </span>
          </button>

          {expanded ? (
            <div className="cia-artifacts-body" id="cia-artifacts-body">
              {artifacts?.headline ? (
                <p className="cia-insights-headline">{artifacts.headline}</p>
              ) : null}

              {artifacts?.takeaways?.length > 0 ? (
                <ul className="cia-insights-takeaways">
                  {artifacts.takeaways.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              ) : null}

              {artifacts?.comparison ? (
                <div className="cia-term-card">
                  <div>
                    <div className="cia-term-label">{artifacts.comparison.ciLabel}</div>
                    <div className="cia-term-value">{artifacts.comparison.ciValue}</div>
                  </div>
                  <div className="cia-term-arrow" aria-hidden="true">
                    →
                  </div>
                  <div>
                    <div className="cia-term-label">{artifacts.comparison.ciaLabel}</div>
                    <div className="cia-term-value">{artifacts.comparison.ciaValue}</div>
                  </div>
                </div>
              ) : null}

              {artifacts?.metricsCharts?.length > 0 ? (
                <div className="cia-metric-chart cia-metric-chart-v2">
                  <div className="cia-metric-legend">
                    <span>
                      <i className="cia-legend-swatch ci" /> CI
                    </span>
                    <span>
                      <i className="cia-legend-swatch cia" /> CiA
                    </span>
                  </div>
                  {artifacts.metricsCharts.map((metric) => (
                    <MetricRow key={metric.label} metric={metric} />
                  ))}
                </div>
              ) : null}

              {artifacts?.validation ? (
                <div className="cia-validation-block">
                  <p>
                    <strong>{artifacts.validation.matched}</strong> controls matched
                  </p>
                  <p className="cia-validation-warn">
                    <strong>{artifacts.validation.discrepancies}</strong> discrepancies flagged
                  </p>
                  <ul>
                    {artifacts.validation.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {artifacts?.bulletPoints?.length > 0 ? (
                <ul className="cia-insights-bullets">
                  {artifacts.bulletPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              ) : null}

              {artifacts?.caseLinks?.length > 0 ? (
                <div className="cia-case-links">
                  <p className="cia-case-links-title">Related cases</p>
                  {artifacts.caseLinks.map((item) => (
                    <div key={`${item.source}-${item.id}`} className="cia-case-link">
                      <div className="cia-case-id">
                        {item.source?.toUpperCase()} · {item.id}
                      </div>
                      <div className="cia-case-title">{item.title}</div>
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

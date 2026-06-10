import { useEffect, useState } from "react";

function ConfidenceDisplay({ value }) {
  const [count, setCount] = useState(0);
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    // Kick off bar transition after one frame so CSS picks it up
    const frameId = requestAnimationFrame(() => setBarWidth(value));

    // Count up from 0 to value over 800ms with ease-out cubic
    const duration = 800;
    const start = performance.now();
    let rafId;
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      setCount(Math.round(value * eased));
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(rafId);
    };
  }, [value]);

  return (
    <>
      <p className="cia-confidence">{count}%</p>
      <p className="text-xs text-[var(--t1-muted)]">How well sources matched this answer</p>
      <div className="cia-confidence-bar mt-2">
        <div className="cia-confidence-fill" style={{ width: `${barWidth}%` }} />
      </div>
    </>
  );
}

function CollapsibleSection({ title, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`cia-insights-section ${open ? "open" : ""}`}>
      <button
        type="button"
        className="cia-insights-section-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>{title}</span>
        {badge != null ? <span className="cia-insights-badge">{badge}</span> : null}
        <span className="cia-insights-section-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? <div className="cia-insights-section-body">{children}</div> : null}
    </section>
  );
}

export function CiaInsightsPanel({ insights, artifacts, embedded = false }) {
  if (!insights && !artifacts?.headline) {
    return (
      <div className={embedded ? "cia-insights-embedded" : "cia-insights"}>
        {!embedded ? (
          <>
            <h2>AI Insights</h2>
            <p className="text-sm text-[var(--t1-muted)]">Sources, confidence, and related context</p>
          </>
        ) : null}
        <div className="cia-insights-empty">
          <div className="cia-insights-empty-icon" aria-hidden="true">
            💡
          </div>
          <p>Ask about Ci/CiA terms, cases, or metrics — insights appear here and under each reply.</p>
        </div>
      </div>
    );
  }

  const sources = insights?.sources ?? [];
  const relatedCases = insights?.relatedCases ?? [];
  const likelyOutcomes = insights?.likelyOutcomes ?? [];

  return (
    <div className={embedded ? "cia-insights-embedded" : "cia-insights"}>
      {!embedded ? (
        <>
          <h2>AI Insights</h2>
          <p className="text-sm text-[var(--t1-muted)]">
            From your case data, glossary, and Vectorize knowledge
          </p>
        </>
      ) : null}

      {artifacts?.headline ? (
        <p className="cia-insights-headline cia-insights-headline-sidebar">{artifacts.headline}</p>
      ) : null}

      {artifacts?.takeaways?.length > 0 ? (
        <ul className="cia-insights-takeaways cia-insights-takeaways-compact">
          {artifacts.takeaways.slice(0, 2).map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      ) : null}

      {insights ? (
        <CollapsibleSection title="Confidence" badge={`${insights.confidence}%`} defaultOpen={false}>
          <ConfidenceDisplay value={insights.confidence} />
        </CollapsibleSection>
      ) : null}

      {likelyOutcomes.length > 0 ? (
        <CollapsibleSection title="Likely outcomes" badge={likelyOutcomes.length} defaultOpen={false}>
          <ul className="cia-outcomes-list">
            {likelyOutcomes.map((item) => (
              <li key={item.resolution}>
                <strong>{item.resolution}</strong>
                <span>{item.confidence}% of similar cases</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}

      {sources.length > 0 ? (
        <CollapsibleSection title="Sources" badge={sources.length} defaultOpen={false}>
          {sources.map((source) => (
            <div key={`${source.title}-${source.meta}`} className="cia-source-item">
              <strong>{source.title}</strong>
              <span>{source.meta}</span>
            </div>
          ))}
        </CollapsibleSection>
      ) : null}

      {relatedCases.length > 0 ? (
        <CollapsibleSection title="Related cases" badge={relatedCases.length} defaultOpen={false}>
          {relatedCases.map((item) => (
            <div key={`${item.source}-${item.id}`} className="cia-case-link">
              <div className="cia-case-id">
                {item.source?.toUpperCase()} · {item.id}
              </div>
              <div className="cia-case-title">{item.title}</div>
              {item.status ? <span className="cia-case-status">{item.status}</span> : null}
            </div>
          ))}
        </CollapsibleSection>
      ) : null}
    </div>
  );
}

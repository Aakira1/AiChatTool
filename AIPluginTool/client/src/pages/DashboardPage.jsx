import { useCallback, useEffect, useState } from "react";
import { BarChart } from "../components/dashboard/BarChart";
import { CsvUploader } from "../components/dashboard/CsvUploader";
import { KpiCard } from "../components/dashboard/KpiCard";
import { getAnalyticsSummary, getKnowledgeStatus, importCases, rebuildKnowledgeIndex } from "../lib/api";
import "../styles/technolog1-theme.css";

export function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [knowledge, setKnowledge] = useState(null);
  const [knowledgePending, setKnowledgePending] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      setError("");
      const [data, knowledgeStatus] = await Promise.all([
        getAnalyticsSummary(),
        getKnowledgeStatus().catch(() => null),
      ]);
      setSummary(data);
      setKnowledge(knowledgeStatus);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRebuildKnowledge = async () => {
    setKnowledgePending(true);
    try {
      setError("");
      const result = await rebuildKnowledgeIndex({ importSamples: true });
      const knowledgeStatus = await getKnowledgeStatus();
      setKnowledge(knowledgeStatus);
      window.alert(
        `Knowledge index rebuilt.\nTerminology: ${result.stats?.terminology ?? 0} vectors\nCases: ${result.stats?.cases ?? 0} vectors`,
      );
    } catch (rebuildError) {
      setError(rebuildError.message);
    } finally {
      setKnowledgePending(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const handleImport = async (source, rows) => {
    const result = await importCases(source, rows);
    await loadSummary();
    return result;
  };

  if (loading) {
    return (
      <div className="t1-dashboard-page t1-loading-state">
        <span className="t1-loading-spinner" aria-hidden="true" />
        Loading dashboard…
      </div>
    );
  }

  return (
    <div className="t1-dashboard-page">
      <header className="t1-animate-in mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold"> OneChat Analytics Dashboard</h1>
          <p className="text-sm text-[var(--t1-gray)]">
            Compare OneChat case systems, monitor search reliability, and track hot topics.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CsvUploader label="CI" source="ci" onImported={handleImport} onError={setError} />
          <CsvUploader label="CIA" source="cia" onImported={handleImport} onError={setError} />
          <button type="button" onClick={() => void loadSummary()} className="t1-btn">
            Refresh
          </button>
        </div>
      </header>

      {error ? <p className="mb-4 text-sm text-[#fb7185]">{error}</p> : null}

      <section className="t1-panel t1-animate-in mb-6 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Cloudflare knowledge (Vectorize)</h3>
            <p className="mt-1 text-xs text-[var(--t1-gray)]">
              Semantic search over glossary, cases, and uploaded documents. See{" "}
              <code>CLOUDFLARE_VECTORIZE.md</code>.
            </p>
          </div>
          <button
            type="button"
            className="t1-btn"
            disabled={knowledgePending || !knowledge?.ragEnabled}
            onClick={() => void handleRebuildKnowledge()}
          >
            {knowledgePending ? "Indexing…" : "Rebuild knowledge index"}
          </button>
        </div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--t1-gray)]">RAG enabled</dt>
            <dd>{knowledge?.ragEnabled ? "Yes" : "No — set VECTORIZE_INDEX_NAME"}</dd>
          </div>
          <div>
            <dt className="text-[var(--t1-gray)]">Index</dt>
            <dd>{knowledge?.indexName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[var(--t1-gray)]">Embeddings</dt>
            <dd>{knowledge?.embeddingModel ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[var(--t1-gray)]">Index reachable</dt>
            <dd>
              {knowledge?.index?.reachable === true
                ? `Yes (${knowledge.index.dimensions ?? "?"} dims)`
                : knowledge?.index?.error ?? (knowledge?.ragEnabled ? "Checking…" : "—")}
            </dd>
          </div>
        </dl>
      </section>

      {!summary?.hasData ? (
        <div className="t1-panel t1-animate-in border-dashed p-8 text-sm text-[var(--t1-gray)]">
          <p>
            Upload CI and CIA CSV files to populate dashboard metrics. Sample files are in{" "}
            <code>sample-data/ci_cases.csv</code> and <code>sample-data/cia_cases.csv</code>.
          </p>
          <p className="mt-3">
            See <code>sample-data/DASHBOARD_SAMPLE_FILES.md</code> for column definitions and examples.
          </p>
        </div>
      ) : (
        <>
          <section className="t1-stagger-grid mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="CI Open Cases" value={summary.ci.open} />
            <KpiCard label="CIA Open Cases" value={summary.cia.open} />
            <KpiCard label="CI Search Reliability" value={`${summary.ci.searchReliability}%`} />
            <KpiCard label="CIA Search Reliability" value={`${summary.cia.searchReliability}%`} />
          </section>

          <section className="t1-stagger-grid mb-6 grid gap-4 md:grid-cols-3">
            <KpiCard
              label="Open Cases Delta (CI - CIA)"
              value={summary.comparison.openDelta}
              tone={summary.comparison.openDelta > 0 ? "negative" : "positive"}
            />
            <KpiCard
              label="Reliability Delta (CI - CIA)"
              value={`${summary.comparison.reliabilityDelta}%`}
              tone={summary.comparison.reliabilityDelta >= 0 ? "positive" : "negative"}
            />
            <KpiCard label="Total Records" value={`${summary.totals.ci + summary.totals.cia}`} />
          </section>

          <section className="t1-stagger-grid mb-6 grid gap-4 lg:grid-cols-2">
            <BarChart title="Case Volume by Day (CI vs CIA)" series={summary.volumeByDay} />
            <section className="t1-panel t1-animate-in p-4">
              <h3 className="mb-1 text-sm font-semibold text-white">Hot Topics</h3>
              <p className="mb-3 text-xs text-[var(--t1-gray)]">
                Most common searches — also shown as quick prompts in the Assistant
              </p>
              <ul className="space-y-2">
                {summary.hotTopics.map((topic) => (
                  <li
                    key={topic.term}
                    className="flex items-center justify-between rounded-md bg-[#3a2550] px-3 py-2 text-sm"
                  >
                    <span>
                      {topic.sources?.includes("chat") ? "💬 " : ""}
                      {topic.sources?.includes("import") ? "📊 " : ""}
                      {topic.term}
                    </span>
                    <span className="text-[var(--t1-orange)]">{topic.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          </section>

          <section className="t1-stagger-grid grid gap-4 lg:grid-cols-2">
            <ResolutionPanel title="CI Likely Resolutions" items={summary.ci.likelyResolutions} />
            <ResolutionPanel title="CIA Likely Resolutions" items={summary.cia.likelyResolutions} />
          </section>
        </>
      )}
    </div>
  );
}

function ResolutionPanel({ title, items }) {
  return (
    <section className="t1-panel t1-animate-in p-4">
      <h3 className="mb-3 text-sm font-semibold text-white">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--t1-gray)]">No resolution data yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.resolution} className="rounded-md bg-[#3a2550] px-3 py-2 text-sm">
              <p>{item.resolution}</p>
              <p className="mt-1 text-xs text-[var(--t1-gray)]">
                {item.count} cases · {item.confidence}% confidence
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

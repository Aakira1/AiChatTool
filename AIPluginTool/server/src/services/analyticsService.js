import {
  findSimilarCases,
  getAllCases,
  getCaseCounts,
} from "../db/repositories/caseRepo.js";
import { buildChatHotTopics, mergeHotTopics } from "./searchAnalyticsService.js";

function summarizeSource(cases, source) {
  const subset = cases.filter((item) => item.source === source);
  const total = subset.length;
  const open = subset.filter((item) => item.status === "open").length;
  const closed = subset.filter((item) => item.status === "closed").length;
  const searches = subset.filter((item) => item.searchTerm);
  const successful = searches.filter((item) => item.searchSuccess).length;
  const searchReliability =
    searches.length === 0 ? 0 : Number(((successful / searches.length) * 100).toFixed(1));

  const resolutions = subset
    .filter((item) => item.resolution)
    .map((item) => item.resolution);
  const resolutionCounts = resolutions.reduce((acc, resolution) => {
    acc[resolution] = (acc[resolution] ?? 0) + 1;
    return acc;
  }, {});
  const likelyResolutions = Object.entries(resolutionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([resolution, count]) => ({
      resolution,
      count,
      confidence: total === 0 ? 0 : Number(((count / total) * 100).toFixed(1)),
    }));

  return {
    total,
    open,
    closed,
    searchReliability,
    likelyResolutions,
  };
}

function buildHotTopics(cases, limit = 8) {
  const counts = cases.reduce((acc, item) => {
    const key = (item.searchTerm || item.topic || "").trim().toLowerCase();
    if (!key || key === "unknown") {
      return acc;
    }
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([term, count]) => ({ term, count, source: "import" }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function buildVolumeSeries(cases) {
  const buckets = {};
  for (const item of cases) {
    const day = (item.createdAt ?? "unknown").slice(0, 10);
    if (!buckets[day]) {
      buckets[day] = { date: day, ci: 0, cia: 0 };
    }
    buckets[day][item.source] += 1;
  }

  return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
}

export function getAnalyticsSummary() {
  const cases = getAllCases();
  const counts = getCaseCounts();
  const ci = summarizeSource(cases, "ci");
  const cia = summarizeSource(cases, "cia");

  return {
    hasData: cases.length > 0,
    totals: counts,
    ci,
    cia,
    comparison: {
      openDelta: ci.open - cia.open,
      closedDelta: ci.closed - cia.closed,
      reliabilityDelta: Number((ci.searchReliability - cia.searchReliability).toFixed(1)),
      totalDelta: ci.total - cia.total,
    },
    importHotTopics: buildHotTopics(cases),
    chatHotTopics: buildChatHotTopics(),
    hotTopics: mergeHotTopics(buildHotTopics(cases), buildChatHotTopics()),
    volumeByDay: buildVolumeSeries(cases),
  };
}

export function getInsightsForQuery(query) {
  const relatedCases = findSimilarCases(query, { limit: 5 });
  const summary = getAnalyticsSummary();

  const resolutionCounts = relatedCases.reduce((acc, item) => {
    if (!item.resolution) {
      return acc;
    }
    acc[item.resolution] = (acc[item.resolution] ?? 0) + 1;
    return acc;
  }, {});

  const likelyOutcomes = Object.entries(resolutionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([resolution, count]) => ({
      resolution,
      count,
      confidence:
        relatedCases.length === 0
          ? 0
          : Number(((count / relatedCases.length) * 100).toFixed(1)),
    }));

  const confidence =
    relatedCases.length === 0
      ? 35
      : Math.min(95, 50 + relatedCases[0].score * 12);

  return {
    confidence,
    sources: relatedCases.map((item) => ({
      caseId: item.caseId,
      source: item.source,
      status: item.status,
    })),
    relatedCases,
    likelyOutcomes,
    summary,
  };
}

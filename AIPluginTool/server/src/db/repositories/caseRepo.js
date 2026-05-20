import crypto from "node:crypto";
import { db } from "../client.js";

const deleteBySource = db.prepare(`DELETE FROM cases WHERE source = ?`);

const insertCase = db.prepare(`
  INSERT INTO cases (
    id, source, case_id, status, created_at, resolved_at,
    search_term, resolution, search_success, topic
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const countBySource = db.prepare(`
  SELECT source, COUNT(*) AS total
  FROM cases
  GROUP BY source
`);

const selectCasesBySource = db.prepare(`
  SELECT
    case_id AS caseId,
    status,
    created_at AS createdAt,
    resolved_at AS resolvedAt,
    search_term AS searchTerm,
    resolution,
    search_success AS searchSuccess,
    topic,
    source
  FROM cases
  WHERE source = ?
`);

const selectAllCases = db.prepare(`
  SELECT
    case_id AS caseId,
    status,
    created_at AS createdAt,
    resolved_at AS resolvedAt,
    search_term AS searchTerm,
    resolution,
    search_success AS searchSuccess,
    topic,
    source
  FROM cases
`);

export function replaceCasesForSource(source, rows) {
  deleteBySource.run(source);

  db.exec("BEGIN");
  try {
    for (const row of rows) {
      insertCase.run(
        crypto.randomUUID(),
        source,
        row.caseId,
        row.status,
        row.createdAt,
        row.resolvedAt,
        row.searchTerm,
        row.resolution,
        row.searchSuccess ? 1 : 0,
        row.topic,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { source, imported: rows.length };
}

export function getCasesBySource(source) {
  return selectCasesBySource.all(source).map((row) => ({
    ...row,
    searchSuccess: Boolean(row.searchSuccess),
  }));
}

export function getAllCases() {
  return selectAllCases.all().map((row) => ({
    ...row,
    searchSuccess: Boolean(row.searchSuccess),
  }));
}

export function getCaseCounts() {
  const counts = Object.fromEntries(
    countBySource.all().map((row) => [row.source, row.total]),
  );
  return {
    ci: counts.ci ?? 0,
    cia: counts.cia ?? 0,
  };
}

export function findSimilarCases(query, { limit = 5 } = {}) {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((term) => term.length > 2);

  if (terms.length === 0) {
    return [];
  }

  const cases = getAllCases();
  const scored = [];

  for (const caseItem of cases) {
    const haystack = [
      caseItem.caseId,
      caseItem.status,
      caseItem.searchTerm,
      caseItem.resolution,
      caseItem.topic,
    ]
      .join(" ")
      .toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (haystack.includes(term)) {
        score += 1;
      }
    }
    if (score === 0) {
      continue;
    }

    if (caseItem.status === "closed" && caseItem.resolution) {
      score += 1;
    }

    scored.push({
      caseId: caseItem.caseId,
      source: caseItem.source.toUpperCase(),
      status: caseItem.status,
      resolution: caseItem.resolution || "No resolution recorded",
      searchTerm: caseItem.searchTerm,
      topic: caseItem.topic,
      score,
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

const REQUIRED_COLUMNS = ["case_id", "status"];

export function normalizeHeader(header) {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

export function parseCsvText(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one data row");
  }

  const headers = lines[0].split(",").map(normalizeHeader);
  for (const required of REQUIRED_COLUMNS) {
    if (!headers.includes(required)) {
      throw new Error(`Missing required CSV column: ${required}`);
    }
  }

  const rows = [];
  for (let index = 1; index < lines.length; index += 1) {
    const values = lines[index].split(",").map((value) => value.trim());
    const record = {};
    headers.forEach((header, headerIndex) => {
      record[header] = values[headerIndex] ?? "";
    });
    rows.push(normalizeCaseRow(record));
  }

  return rows;
}

function normalizeCaseRow(row) {
  const searchSuccessRaw = String(row.search_success ?? row.searchsuccess ?? "").toLowerCase();
  const searchSuccess =
    searchSuccessRaw === "1" ||
    searchSuccessRaw === "true" ||
    searchSuccessRaw === "yes" ||
    searchSuccessRaw === "y";

  return {
    caseId: String(row.case_id),
    status: String(row.status ?? "open").toLowerCase(),
    createdAt: row.created_at || row.createdat || null,
    resolvedAt: row.resolved_at || row.resolvedat || null,
    searchTerm: row.search_term || row.searchterm || row.topic || "",
    resolution: row.resolution || "",
    searchSuccess,
    topic: row.topic || row.search_term || row.searchterm || "general",
  };
}

export function normalizeImportedRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Import payload must be a non-empty array");
  }

  return rows.map((row) =>
    normalizeCaseRow({
      case_id: row.caseId ?? row.case_id,
      status: row.status,
      created_at: row.createdAt ?? row.created_at,
      resolved_at: row.resolvedAt ?? row.resolved_at,
      search_term: row.searchTerm ?? row.search_term,
      resolution: row.resolution,
      search_success: row.searchSuccess ?? row.search_success,
      topic: row.topic,
    }),
  );
}

export function parseCsvFile(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV must include header and at least one row");
  }

  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return {
      caseId: row.case_id,
      status: (row.status || "open").toLowerCase(),
      createdAt: row.created_at || null,
      resolvedAt: row.resolved_at || null,
      searchTerm: row.search_term || row.topic || "",
      resolution: row.resolution || "",
      searchSuccess: ["1", "true", "yes", "y"].includes(
        String(row.search_success ?? "").toLowerCase(),
      ),
      topic: row.topic || row.search_term || "general",
    };
  });
}

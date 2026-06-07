import { db } from "../client.js";

const getStmt = db.prepare(
  `SELECT file_name, data, updated_at FROM companion_state WHERE email = ?`,
);
const upsertStmt = db.prepare(`
  INSERT INTO companion_state (email, file_name, data, updated_at)
  VALUES (?, ?, ?, datetime('now'))
  ON CONFLICT(email) DO UPDATE SET file_name = excluded.file_name,
                                   data = excluded.data,
                                   updated_at = datetime('now')
`);

/** Load a user's saved Companion checklist, or null. */
export function getCompanion(email) {
  if (!email) return null;
  const row = getStmt.get(email.trim().toLowerCase());
  if (!row) return null;
  let rows = null;
  let sheets = null;
  try {
    const parsed = row.data ? JSON.parse(row.data) : null;
    if (Array.isArray(parsed)) {
      // Legacy format: the data column was a bare 2D rows array.
      rows = parsed;
    } else if (parsed && typeof parsed === "object") {
      rows = parsed.rows ?? null;
      sheets = parsed.sheets ?? null;
    }
  } catch {
    rows = null;
  }
  return { fileName: row.file_name || "", rows, sheets, updatedAt: row.updated_at };
}

/**
 * Save (upsert) a user's Companion checklist. `data` may be a bare rows array
 * (legacy) or an object { rows, sheets } for multi-sheet config companions.
 */
export function saveCompanion(email, fileName, data) {
  if (!email) return;
  const rows = Array.isArray(data) ? data : (data?.rows ?? null);
  const sheets = Array.isArray(data) ? null : (data?.sheets ?? null);
  const hasContent = (rows && rows.length) || (sheets && sheets.length);
  const serialized = hasContent ? JSON.stringify({ rows, sheets }) : null;
  upsertStmt.run(email.trim().toLowerCase(), fileName || "", serialized);
}

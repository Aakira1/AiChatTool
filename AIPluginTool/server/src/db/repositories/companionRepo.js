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
  try {
    rows = row.data ? JSON.parse(row.data) : null;
  } catch {
    rows = null;
  }
  return { fileName: row.file_name || "", rows, updatedAt: row.updated_at };
}

/** Save (upsert) a user's Companion checklist. */
export function saveCompanion(email, fileName, rows) {
  if (!email) return;
  const data = rows && rows.length ? JSON.stringify(rows) : null;
  upsertStmt.run(email.trim().toLowerCase(), fileName || "", data);
}

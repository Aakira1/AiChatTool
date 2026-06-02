import { randomUUID } from "node:crypto";
import { db } from "../client.js";

const insertStmt = db.prepare(`
  INSERT INTO audit_log (id, actor_email, action, target_type, target_id, summary)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const listStmt = db.prepare(`
  SELECT id, actor_email, action, target_type, target_id, summary, created_at
  FROM audit_log
  ORDER BY created_at DESC
  LIMIT ?
`);

/**
 * Record a moderation/admin action. Best-effort: never throws into the request
 * path, since failing to log shouldn't block the action itself.
 */
export function recordAudit({
  actorEmail = null,
  action,
  targetType = null,
  targetId = null,
  summary = "",
}) {
  try {
    insertStmt.run(randomUUID(), actorEmail, action, targetType, targetId, summary);
  } catch {
    /* logging is best-effort */
  }
}

export function listAudit(limit = 100) {
  return listStmt.all(limit);
}

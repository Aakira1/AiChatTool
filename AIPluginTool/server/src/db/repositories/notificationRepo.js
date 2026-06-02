import { randomUUID } from "node:crypto";
import { db } from "../client.js";

const insertStmt = db.prepare(`
  INSERT INTO notifications (id, user_email, type, actor_email, actor_name, post_id, comment_id, message)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const listStmt = db.prepare(`
  SELECT id, user_email, type, actor_email, actor_name, post_id, comment_id, message, read, created_at
  FROM notifications
  WHERE user_email = ?
  ORDER BY created_at DESC
  LIMIT 50
`);

const countUnreadStmt = db.prepare(`
  SELECT COUNT(*) AS count FROM notifications WHERE user_email = ? AND read = 0
`);

const markAllReadStmt = db.prepare(`
  UPDATE notifications SET read = 1 WHERE user_email = ? AND read = 0
`);

const markReadStmt = db.prepare(`
  UPDATE notifications SET read = 1 WHERE id = ? AND user_email = ?
`);

const clearAllStmt = db.prepare(`
  DELETE FROM notifications WHERE user_email = ?
`);

/** Create a notification for a recipient. No-op if recipient is missing or is the actor. */
export function createNotification({
  userEmail,
  type,
  actorEmail = null,
  actorName = null,
  postId = null,
  commentId = null,
  message,
}) {
  if (!userEmail || (actorEmail && userEmail === actorEmail)) {
    return null;
  }
  const id = randomUUID();
  insertStmt.run(id, userEmail, type, actorEmail, actorName, postId, commentId, message);
  return id;
}

export function listNotifications(userEmail) {
  if (!userEmail) return [];
  return listStmt.all(userEmail);
}

export function countUnread(userEmail) {
  if (!userEmail) return 0;
  return countUnreadStmt.get(userEmail).count;
}

export function markAllRead(userEmail) {
  if (!userEmail) return;
  markAllReadStmt.run(userEmail);
}

export function markRead(id, userEmail) {
  if (!userEmail) return;
  markReadStmt.run(id, userEmail);
}

/** Delete all of a user's notifications. Returns the number removed. */
export function clearAll(userEmail) {
  if (!userEmail) return 0;
  return clearAllStmt.run(userEmail).changes;
}

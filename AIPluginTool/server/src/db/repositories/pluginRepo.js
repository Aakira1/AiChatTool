import { db } from "../client.js";
import { PLUGIN_IDS } from "../../config/plugins.js";
import { roleFor } from "../../utils/permissions.js";

const listForUserStmt = db.prepare(`SELECT plugin FROM user_plugins WHERE email = ?`);
const grantStmt = db.prepare(
  `INSERT OR IGNORE INTO user_plugins (email, plugin) VALUES (?, ?)`,
);
const revokeStmt = db.prepare(`DELETE FROM user_plugins WHERE email = ? AND plugin = ?`);

/** Plugin ids explicitly granted to a user (excludes implicit admin access). */
export function listUserPlugins(email) {
  if (!email) return [];
  return listForUserStmt.all(email.trim().toLowerCase()).map((row) => row.plugin);
}

/** Grant or revoke a single plugin for a user. */
export function setUserPlugin(email, plugin, enabled) {
  const normalizedEmail = email.trim().toLowerCase();
  if (enabled) {
    grantStmt.run(normalizedEmail, plugin);
  } else {
    revokeStmt.run(normalizedEmail, plugin);
  }
  return enabled;
}

/**
 * Effective plugin access for a user: admins get every plugin, everyone else
 * gets only what's been granted to them.
 */
export function effectivePluginsFor(email, dbRole = "user") {
  if (roleFor(email, dbRole) === "admin") return [...PLUGIN_IDS];
  return listUserPlugins(email);
}

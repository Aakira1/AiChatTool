import { randomUUID } from "node:crypto";
import { db } from "../client.js";
import { hashPassword } from "../../utils/password.js";

const insertUserStmt = db.prepare(`
  INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)
`);

const getUserByEmailStmt = db.prepare(`
  SELECT id, email, password_hash, display_name, role, created_at FROM users WHERE email = ?
`);

const countUsersStmt = db.prepare(`SELECT COUNT(*) AS count FROM users`);

const listMentionableStmt = db.prepare(`
  SELECT email, display_name FROM users
`);

const updateDisplayNameStmt = db.prepare(`
  UPDATE users SET display_name = ? WHERE email = ?
`);

const updatePasswordStmt = db.prepare(`
  UPDATE users SET password_hash = ? WHERE email = ?
`);

const listAllUsersStmt = db.prepare(`
  SELECT id, email, display_name, role, created_at FROM users ORDER BY created_at ASC
`);

const updateRoleStmt = db.prepare(`
  UPDATE users SET role = ? WHERE email = ?
`);

/** Look up a user by email (case-insensitive). Returns the row incl. password_hash, or null. */
export function getUserByEmail(email) {
  if (!email) return null;
  return getUserByEmailStmt.get(email.trim().toLowerCase()) ?? null;
}

/** Create a new user. Throws if the email already exists (UNIQUE constraint). */
export function createUser({ email, password, displayName = "" }) {
  const id = randomUUID();
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = hashPassword(password);
  insertUserStmt.run(id, normalizedEmail, passwordHash, displayName.trim() || null);
  return {
    id,
    email: normalizedEmail,
    display_name: displayName.trim() || null,
  };
}

export function countUsers() {
  return countUsersStmt.get().count;
}

/** All registered users that can be @mentioned (email + display name). */
export function listMentionableUsers() {
  return listMentionableStmt.all();
}

/** Update a user's display name. Returns the trimmed name (or null) that was stored. */
export function updateDisplayName(email, displayName) {
  const normalizedEmail = email.trim().toLowerCase();
  const name = (displayName ?? "").trim() || null;
  updateDisplayNameStmt.run(name, normalizedEmail);
  return name;
}

/** All registered users with their role, for the admin panel. */
export function listAllUsers() {
  return listAllUsersStmt.all();
}

/** Set a user's role ('user' | 'admin'). Returns true if a row changed. */
export function setUserRole(email, role) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedRole = role === "admin" ? "admin" : "user";
  return updateRoleStmt.run(normalizedRole, normalizedEmail).changes > 0;
}

/** Update a user's password (hashes the plaintext). Returns true if a row changed. */
export function updatePassword(email, newPassword) {
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = hashPassword(newPassword);
  return updatePasswordStmt.run(passwordHash, normalizedEmail).changes > 0;
}

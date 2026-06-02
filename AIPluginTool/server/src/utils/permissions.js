import { env } from "../config/env.js";

/** True if the user is the configured admin account or has the admin role. */
export function isAdmin(user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const adminEmail = env.authEmail?.trim().toLowerCase();
  return Boolean(adminEmail) && user.email?.toLowerCase() === adminEmail;
}

/** True if the user may edit/delete content owned by `ownerEmail` (owner or admin). */
export function canModify(user, ownerEmail) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  return Boolean(ownerEmail) && user.email?.toLowerCase() === ownerEmail.toLowerCase();
}

/** Resolve the effective role for an email, treating the configured admin as admin. */
export function roleFor(email, dbRole = "user") {
  const adminEmail = env.authEmail?.trim().toLowerCase();
  if (adminEmail && email?.trim().toLowerCase() === adminEmail) {
    return "admin";
  }
  return dbRole === "admin" ? "admin" : "user";
}

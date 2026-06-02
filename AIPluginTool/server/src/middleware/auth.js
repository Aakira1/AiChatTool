import { env } from "../config/env.js";
import { verifySessionToken } from "../utils/session.js";
import { getUserByEmail } from "../db/repositories/userRepo.js";
import { roleFor, isAdmin } from "../utils/permissions.js";

const SESSION_COOKIE = "t1_session";

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export function readSessionFromRequest(request) {
  const cookieHeader = request.headers.cookie ?? "";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));

  if (!match) {
    return null;
  }

  const token = decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
  return verifySessionToken(token, env.authSecret);
}

export function requireAuth(request, response, next) {
  if (!env.authEnabled) {
    // Auth disabled: act as the configured admin so moderation works locally.
    request.user = { email: env.authEmail, role: "admin" };
    next();
    return;
  }

  const session = readSessionFromRequest(request);
  if (!session) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  const dbRole = getUserByEmail(session.email)?.role ?? "user";
  request.user = { email: session.email, role: roleFor(session.email, dbRole) };
  next();
}

/** Guard that requires the authenticated user to be an admin. Run after requireAuth. */
export function requireAdmin(request, response, next) {
  if (!isAdmin(request.user)) {
    response.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

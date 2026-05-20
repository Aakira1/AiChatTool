import { env } from "../config/env.js";
import { verifySessionToken } from "../utils/session.js";

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
    next();
    return;
  }

  const session = readSessionFromRequest(request);
  if (!session) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  request.user = { email: session.email };
  next();
}

import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { getSessionCookieName, readSessionFromRequest } from "../middleware/auth.js";
import { verifyPassword } from "../utils/password.js";
import { createSessionToken } from "../utils/session.js";
import { roleFor } from "../utils/permissions.js";
import { effectivePluginsFor } from "../db/repositories/pluginRepo.js";
import { PLUGIN_IDS } from "../config/plugins.js";
import {
  createUser,
  getUserByEmail,
  updateDisplayName,
  updatePassword,
} from "../db/repositories/userRepo.js";

const emailField = z
  .string()
  .trim()
  .min(3)
  .max(200)
  .refine((value) => /^[^\s@]+@[^\s@]+$/.test(value), {
    message: "Invalid email address",
  });

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(8).max(200),
});

const registerSchema = z.object({
  email: emailField,
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(80).optional(),
});

export const authRouter = Router();

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    maxAge: env.sessionMaxAgeMs,
    path: "/",
  };
}

function issueSession(response, email) {
  const token = createSessionToken({
    email,
    secret: env.authSecret,
    maxAgeMs: env.sessionMaxAgeMs,
  });
  response.cookie(getSessionCookieName(), token, sessionCookieOptions());
}

/** Resolve a friendly display name for an authenticated email. */
function displayNameFor(email) {
  const user = getUserByEmail(email);
  return user?.display_name ?? null;
}

authRouter.get("/me", (request, response) => {
  if (!env.authEnabled) {
    response.json({
      authenticated: true,
      email: env.authEmail,
      authDisabled: true,
      role: "admin",
      plugins: PLUGIN_IDS,
    });
    return;
  }

  const session = readSessionFromRequest(request);
  if (!session) {
    response.status(401).json({ authenticated: false });
    return;
  }

  const dbRole = getUserByEmail(session.email)?.role ?? "user";
  response.json({
    authenticated: true,
    email: session.email,
    displayName: displayNameFor(session.email),
    role: roleFor(session.email, dbRole),
    plugins: effectivePluginsFor(session.email, dbRole),
  });
});

authRouter.post("/register", (request, response) => {
  if (!env.authEnabled) {
    response.status(400).json({ error: "Authentication is disabled on this server" });
    return;
  }

  const parsed = registerSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({
      error: parsed.error.errors[0]?.message ?? "Invalid registration details",
    });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();

  // Reject collisions with an existing account or the reserved admin email.
  if (email === env.authEmail.trim().toLowerCase() || getUserByEmail(email)) {
    response.status(409).json({ error: "An account with that email already exists" });
    return;
  }

  let created;
  try {
    created = createUser({
      email,
      password: parsed.data.password,
      displayName: parsed.data.displayName ?? "",
    });
  } catch {
    response.status(409).json({ error: "An account with that email already exists" });
    return;
  }

  issueSession(response, created.email);
  response.status(201).json({
    authenticated: true,
    email: created.email,
    displayName: created.display_name,
    role: roleFor(created.email, "user"),
    plugins: effectivePluginsFor(created.email, "user"),
  });
});

authRouter.post("/login", (request, response) => {
  if (!env.authEnabled) {
    response.status(400).json({ error: "Authentication is disabled on this server" });
    return;
  }

  const parsed = loginSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({
      error: parsed.error.errors[0]?.message ?? "Invalid email or password format",
    });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();

  // 1) Registered users in the database.
  const user = getUserByEmail(email);
  if (user) {
    if (!verifyPassword(parsed.data.password, user.password_hash)) {
      response.status(401).json({ error: "Invalid email or password" });
      return;
    }
    issueSession(response, user.email);
    response.json({
      authenticated: true,
      email: user.email,
      displayName: user.display_name,
      role: roleFor(user.email, user.role ?? "user"),
      plugins: effectivePluginsFor(user.email, user.role ?? "user"),
    });
    return;
  }

  // 2) Fall back to the configured admin account.
  const emailMatches = email === env.authEmail.trim().toLowerCase();
  const passwordMatches = verifyPassword(parsed.data.password, env.authPasswordHash);

  if (!emailMatches || !passwordMatches) {
    response.status(401).json({ error: "Invalid email or password" });
    return;
  }

  issueSession(response, env.authEmail);
  response.json({ authenticated: true, email: env.authEmail, role: "admin", plugins: PLUGIN_IDS });
});

const displayNameSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

/** Resolve the authenticated email from the session, or null. */
function authedEmail(request) {
  if (!env.authEnabled) return env.authEmail;
  const session = readSessionFromRequest(request);
  return session?.email ?? null;
}

authRouter.patch("/display-name", (request, response) => {
  const email = authedEmail(request);
  if (!email) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  const parsed = displayNameSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({
      error: parsed.error.errors[0]?.message ?? "Invalid display name",
    });
    return;
  }

  const user = getUserByEmail(email);
  if (!user) {
    response.status(400).json({ error: "Display name can only be changed for registered accounts" });
    return;
  }

  const name = updateDisplayName(email, parsed.data.displayName);
  response.json({ email, displayName: name });
});

authRouter.post("/change-password", (request, response) => {
  const email = authedEmail(request);
  if (!email) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  const parsed = changePasswordSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({
      error: parsed.error.errors[0]?.message ?? "Invalid password details",
    });
    return;
  }

  const user = getUserByEmail(email);
  if (!user) {
    response.status(400).json({ error: "Password can only be changed for registered accounts" });
    return;
  }

  if (!verifyPassword(parsed.data.currentPassword, user.password_hash)) {
    response.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  updatePassword(email, parsed.data.newPassword);
  response.json({ ok: true });
});

authRouter.post("/logout", (_request, response) => {
  response.clearCookie(getSessionCookieName(), {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: "/",
  });
  response.status(204).end();
});

import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { getSessionCookieName, readSessionFromRequest } from "../middleware/auth.js";
import { verifyPassword } from "../utils/password.js";
import { createSessionToken } from "../utils/session.js";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(3)
    .max(200)
    .refine((value) => /^[^\s@]+@[^\s@]+$/.test(value), {
      message: "Invalid email address",
    }),
  password: z.string().min(8).max(200),
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

authRouter.get("/me", (request, response) => {
  if (!env.authEnabled) {
    response.json({ authenticated: true, email: env.authEmail, authDisabled: true });
    return;
  }

  const session = readSessionFromRequest(request);
  if (!session) {
    response.status(401).json({ authenticated: false });
    return;
  }

  response.json({ authenticated: true, email: session.email });
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

  const emailMatches =
    parsed.data.email.trim().toLowerCase() === env.authEmail.trim().toLowerCase();
  const passwordMatches = verifyPassword(parsed.data.password, env.authPasswordHash);

  if (!emailMatches || !passwordMatches) {
    response.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = createSessionToken({
    email: env.authEmail,
    secret: env.authSecret,
    maxAgeMs: env.sessionMaxAgeMs,
  });

  response.cookie(getSessionCookieName(), token, sessionCookieOptions());
  response.json({ authenticated: true, email: env.authEmail });
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

import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAdmin } from "../middleware/auth.js";
import {
  listAllUsers,
  getUserByEmail,
  setUserRole,
} from "../db/repositories/userRepo.js";
import { roleFor } from "../utils/permissions.js";

export const adminRouter = Router();

// Every route here requires an admin.
adminRouter.use(requireAdmin);

const configuredAdmin = env.authEmail?.trim().toLowerCase() ?? "";

/** Shape a user row for the client, marking the env admin as locked. */
function present(user) {
  const email = user.email.toLowerCase();
  return {
    email: user.email,
    display_name: user.display_name,
    role: roleFor(user.email, user.role ?? "user"),
    created_at: user.created_at,
    // The configured AUTH_EMAIL account is always admin and can't be demoted.
    locked: email === configuredAdmin,
  };
}

adminRouter.get("/users", (request, response) => {
  const users = listAllUsers().map(present);
  // The env admin may not have a DB row — surface it so it's visible/lockable.
  if (configuredAdmin && !users.some((u) => u.email.toLowerCase() === configuredAdmin)) {
    users.unshift({
      email: env.authEmail,
      display_name: null,
      role: "admin",
      created_at: null,
      locked: true,
    });
  }
  response.json({ users });
});

const roleSchema = z.object({
  role: z.enum(["user", "admin"]),
});

adminRouter.patch("/users/:email/role", (request, response) => {
  const parsed = roleSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Role must be 'user' or 'admin'" });
    return;
  }

  const targetEmail = String(request.params.email ?? "").trim().toLowerCase();
  if (!targetEmail) {
    response.status(400).json({ error: "Missing user email" });
    return;
  }

  if (targetEmail === configuredAdmin) {
    response.status(400).json({ error: "The primary admin account cannot be changed" });
    return;
  }

  if (targetEmail === request.user?.email?.toLowerCase()) {
    response.status(400).json({ error: "You can't change your own role" });
    return;
  }

  const user = getUserByEmail(targetEmail);
  if (!user) {
    response.status(404).json({ error: "User not found" });
    return;
  }

  setUserRole(targetEmail, parsed.data.role);
  response.json({ email: targetEmail, role: parsed.data.role });
});

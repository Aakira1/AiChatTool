import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAdmin } from "../middleware/auth.js";
import {
  listAllUsers,
  getUserByEmail,
  setUserRole,
} from "../db/repositories/userRepo.js";
import { listForums, listPosts } from "../db/repositories/forumRepo.js";
import { recordAudit, listAudit } from "../db/repositories/auditRepo.js";
import { listUserPlugins, setUserPlugin } from "../db/repositories/pluginRepo.js";
import { PLUGINS, PLUGIN_IDS, isValidPlugin } from "../config/plugins.js";
import { roleFor } from "../utils/permissions.js";

export const adminRouter = Router();

// Every route here requires an admin.
adminRouter.use(requireAdmin);

const configuredAdmin = env.authEmail?.trim().toLowerCase() ?? "";

/** Shape a user row for the client, marking the env admin as locked. */
function present(user) {
  const email = user.email.toLowerCase();
  const role = roleFor(user.email, user.role ?? "user");
  return {
    email: user.email,
    display_name: user.display_name,
    role,
    created_at: user.created_at,
    // Admins implicitly have every plugin; others get what's been granted.
    plugins: role === "admin" ? [...PLUGIN_IDS] : listUserPlugins(user.email),
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
      plugins: [...PLUGIN_IDS],
      locked: true,
    });
  }
  response.json({ users });
});

// The registry of permission-gated plugins (for the Admin → Plugins tab).
adminRouter.get("/plugins", (_request, response) => {
  response.json({ plugins: PLUGINS });
});

const pluginSchema = z.object({
  plugin: z.string().min(1),
  enabled: z.boolean(),
});

adminRouter.patch("/users/:email/plugins", (request, response) => {
  const parsed = pluginSchema.safeParse(request.body ?? {});
  if (!parsed.success || !isValidPlugin(parsed.data.plugin)) {
    response.status(400).json({ error: "Provide a valid plugin id and enabled flag" });
    return;
  }

  const targetEmail = String(request.params.email ?? "").trim().toLowerCase();
  const user = getUserByEmail(targetEmail);
  if (!user) {
    response.status(404).json({ error: "User not found" });
    return;
  }
  if (roleFor(user.email, user.role ?? "user") === "admin") {
    response.status(400).json({ error: "Admins already have access to every plugin" });
    return;
  }

  setUserPlugin(targetEmail, parsed.data.plugin, parsed.data.enabled);
  recordAudit({
    actorEmail: request.user?.email ?? null,
    action: parsed.data.enabled ? "grant_plugin" : "revoke_plugin",
    targetType: "user",
    targetId: targetEmail,
    summary: `${parsed.data.enabled ? "Granted" : "Revoked"} "${parsed.data.plugin}" for ${targetEmail}`,
  });
  response.json({ email: targetEmail, plugins: listUserPlugins(targetEmail) });
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
  recordAudit({
    actorEmail: request.user?.email ?? null,
    action: "set_role",
    targetType: "user",
    targetId: targetEmail,
    summary: `Set ${targetEmail} role to ${parsed.data.role}`,
  });
  response.json({ email: targetEmail, role: parsed.data.role });
});

// ---- Moderation ---------------------------------------------------------

// All forums with their posts, for the admin moderation view. Comments are
// loaded on demand by the client via the normal forum endpoints.
adminRouter.get("/content", (request, response) => {
  const forums = listForums().map((forum) => ({
    id: forum.id,
    name: forum.name,
    created_by: forum.created_by,
    post_count: forum.post_count,
    posts: listPosts(forum.id, request.user?.email ?? "").map((post) => ({
      id: post.id,
      title: post.title,
      author: post.author,
      author_name: post.author_name,
      score: post.score,
      comment_count: post.comment_count,
      created_at: post.created_at,
    })),
  }));
  response.json({ forums });
});

// ---- Audit log ----------------------------------------------------------

adminRouter.get("/audit", (request, response) => {
  const limit = Math.min(Math.max(Number(request.query.limit ?? 100), 1), 500);
  response.json({ entries: listAudit(limit) });
});

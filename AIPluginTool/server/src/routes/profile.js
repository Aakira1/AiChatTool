import { Router } from "express";
import { getUserPreferences, updateUserPreferences } from "../db/repositories/conversationRepo.js";

const PROFILE_KEYS = new Set([
  "profile_name",
  "profile_email",
  "profile_role",
  "profile_team",
  "profile_environment",
  "profile_picture",
  "notifications_enabled",
  "response_style",
  "tone",
  "format",
]);

export const profileRouter = Router();

profileRouter.get("/", (_request, response) => {
  response.json(getUserPreferences());
});

profileRouter.put("/", (request, response) => {
  const updates = {};
  for (const [key, value] of Object.entries(request.body ?? {})) {
    if (PROFILE_KEYS.has(key) && value !== undefined && value !== null) {
      updates[key] = String(value);
    }
  }

  if (Object.keys(updates).length === 0) {
    response.status(400).json({ error: "No valid profile fields provided" });
    return;
  }

  response.json(updateUserPreferences(updates));
});

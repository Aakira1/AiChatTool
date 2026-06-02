import { Router } from "express";
import {
  listNotifications,
  countUnread,
  markAllRead,
  markRead,
  clearAll,
} from "../db/repositories/notificationRepo.js";

export const notificationsRouter = Router();

notificationsRouter.get("/", (request, response) => {
  const email = request.user?.email;
  response.json({
    notifications: listNotifications(email),
    unread: countUnread(email),
  });
});

notificationsRouter.get("/unread-count", (request, response) => {
  response.json({ unread: countUnread(request.user?.email) });
});

notificationsRouter.post("/read-all", (request, response) => {
  markAllRead(request.user?.email);
  response.json({ unread: 0 });
});

notificationsRouter.delete("/", (request, response) => {
  clearAll(request.user?.email);
  response.json({ notifications: [], unread: 0 });
});

notificationsRouter.post("/:id/read", (request, response) => {
  markRead(request.params.id, request.user?.email);
  response.json({ unread: countUnread(request.user?.email) });
});

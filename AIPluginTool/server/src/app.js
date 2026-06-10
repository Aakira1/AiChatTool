import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { requireAuth } from "./middleware/auth.js";
import { attachClientApp } from "./middleware/serveClient.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { analyticsRouter } from "./routes/analytics.js";
import { authRouter } from "./routes/auth.js";
import { chatRouter } from "./routes/chat.js";
import { conversationsRouter } from "./routes/conversations.js";
import { importRouter } from "./routes/import.js";
import { messagesRouter } from "./routes/messages.js";
import { profileRouter } from "./routes/profile.js";
import { terminologyRouter } from "./routes/terminology.js";
import { knowledgeRouter } from "./routes/knowledge.js";
import { connectorsRouter } from "./routes/connectors.js";
import { forumsRouter } from "./routes/forums.js";
import { notificationsRouter } from "./routes/notifications.js";
import { adminRouter } from "./routes/admin.js";
import { exportRouter } from "./routes/export.js";
import { companionRouter } from "./routes/companion.js";
import { bpaRouter } from "./routes/bpa.js";
import { relayRouter } from "./routes/relay.js";
import { visionRouter } from "./routes/vision.js";

export function createApp() {
  const app = express();

  if (env.trustProxy) {
    app.set("trust proxy", 1);
  }

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.clientOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        if (origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://")) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "40mb" }));
  app.use((request, response, next) => {
    const startedAt = Date.now();
    response.on("finish", () => {
      const elapsedMs = Date.now() - startedAt;
      console.log(`${request.method} ${request.originalUrl} -> ${response.statusCode} (${elapsedMs}ms)`);
    });
    next();
  });

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      authEnabled: env.authEnabled,
      nodeEnv: env.nodeEnv,
      ragEnabled: env.vectorizeEnabled,
      vectorizeIndex: env.vectorizeIndexName || null,
    });
  });

  app.use("/api/auth", authRouter);

  app.use(
    "/api",
    rateLimit({
      windowMs: 60 * 1000,
      max: env.authEnabled ? 120 : 30,
      standardHeaders: true,
      legacyHeaders: false,
    }),
    requireAuth,
  );

  app.use("/api/conversations", conversationsRouter);
  app.use("/api/messages", messagesRouter);
  app.use("/api/import", importRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/terminology", terminologyRouter);
  app.use("/api/knowledge", knowledgeRouter);
  app.use("/api/connectors", connectorsRouter);
  app.use("/api/forums", forumsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/export", exportRouter);
  app.use("/api/companion", companionRouter);
  app.use("/api/bpa", bpaRouter);
  app.use("/api/relay", relayRouter);
  app.use("/api/vision", visionRouter);

  if (env.serveClient) {
    attachClientApp(app);
  }

  app.use(errorHandler);

  return app;
}

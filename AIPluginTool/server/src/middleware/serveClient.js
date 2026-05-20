import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const clientDist = path.resolve(serverRoot, "../client/dist");

export function attachClientApp(app) {
  if (!fs.existsSync(clientDist)) {
    console.warn(`SERVE_CLIENT is enabled but ${clientDist} was not found. Run npm run build first.`);
    return;
  }

  app.use(express.static(clientDist, { maxAge: "1h", index: false }));

  app.get("*", (request, response, next) => {
    if (request.path.startsWith("/api") || request.path === "/health") {
      next();
      return;
    }
    response.sendFile(path.join(clientDist, "index.html"));
  });
}

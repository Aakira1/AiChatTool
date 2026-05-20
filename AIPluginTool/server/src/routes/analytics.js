import { Router } from "express";
import { getAnalyticsSummary, getInsightsForQuery } from "../services/analyticsService.js";

export const analyticsRouter = Router();

analyticsRouter.get("/summary", (_request, response) => {
  response.json(getAnalyticsSummary());
});

analyticsRouter.get("/insights", (request, response) => {
  const query = String(request.query.q ?? "").trim();
  if (!query) {
    response.status(400).json({ error: "Query parameter q is required" });
    return;
  }
  response.json(getInsightsForQuery(query));
});

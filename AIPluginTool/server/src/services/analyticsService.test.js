import { describe, expect, it, beforeEach } from "vitest";
import { replaceCasesForSource } from "../db/repositories/caseRepo.js";
import { getAnalyticsSummary } from "./analyticsService.js";

describe("analyticsService", () => {
  beforeEach(() => {
    replaceCasesForSource("ci", [
      {
        caseId: "CI-1",
        status: "open",
        createdAt: "2026-05-01",
        resolvedAt: null,
        searchTerm: "billing issue",
        resolution: "",
        searchSuccess: false,
        topic: "billing",
      },
      {
        caseId: "CI-2",
        status: "closed",
        createdAt: "2026-05-02",
        resolvedAt: "2026-05-03",
        searchTerm: "password reset",
        resolution: "Reset complete",
        searchSuccess: true,
        topic: "account",
      },
    ]);
    replaceCasesForSource("cia", [
      {
        caseId: "CIA-1",
        status: "open",
        createdAt: "2026-05-01",
        resolvedAt: null,
        searchTerm: "billing issue",
        resolution: "",
        searchSuccess: false,
        topic: "billing",
      },
    ]);
  });

  it("returns CI vs CIA summary metrics", () => {
    const summary = getAnalyticsSummary();
    expect(summary.hasData).toBe(true);
    expect(summary.ci.open).toBe(1);
    expect(summary.cia.open).toBe(1);
    expect(summary.hotTopics.length).toBeGreaterThan(0);
  });
});

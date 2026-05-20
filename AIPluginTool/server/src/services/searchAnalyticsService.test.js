import { describe, expect, it } from "vitest";
import { mergeHotTopics } from "./searchAnalyticsService.js";

describe("mergeHotTopics", () => {
  it("combines import and chat counts for the same term", () => {
    const merged = mergeHotTopics(
      [{ term: "rate qualifier", count: 4, source: "import" }],
      [{ term: "rate qualifier", count: 2, source: "chat" }],
    );

    expect(merged[0].term).toBe("rate qualifier");
    expect(merged[0].count).toBe(6);
    expect(merged[0].sources).toContain("import");
    expect(merged[0].sources).toContain("chat");
  });
});

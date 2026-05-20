import { describe, expect, it } from "vitest";
import { buildResponseArtifacts } from "./artifactService.js";

describe("artifactService", () => {
  it("builds terminology comparison artifacts", () => {
    const result = buildResponseArtifacts("What's the CiA equivalent of a Rate Qualifier?");
    expect(result.artifacts.comparison?.ciValue).toBe("Rate Qualifier");
    expect(result.artifacts.comparison?.ciaValue).toBe("Levy");
    expect(result.insights.confidence).toBeGreaterThan(90);
  });
});

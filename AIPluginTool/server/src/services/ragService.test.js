import { describe, expect, it } from "vitest";
import { buildTerminologyRecords } from "./ragService.js";

describe("ragService", () => {
  it("builds terminology vector records from glossary", () => {
    const records = buildTerminologyRecords();
    expect(records.length).toBeGreaterThan(0);
    expect(records[0]).toMatchObject({
      sourceType: "terminology",
      text: expect.any(String),
      title: expect.stringContaining("→"),
    });
  });
});

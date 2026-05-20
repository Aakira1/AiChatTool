import { describe, expect, it } from "vitest";
import { chunkText } from "./textChunk.js";

describe("chunkText", () => {
  it("returns empty array for blank input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   ")).toEqual([]);
  });

  it("splits long text with overlap", () => {
    const text = "a".repeat(3000);
    const chunks = chunkText(text, { chunkSize: 1000, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0].length).toBe(1000);
  });
});

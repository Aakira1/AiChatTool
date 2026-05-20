import { describe, expect, it } from "vitest";
import { findSimilarExchanges } from "./conversationRepo.js";

describe("findSimilarExchanges", () => {
  it("returns empty results for very short queries", () => {
    expect(findSimilarExchanges("a")).toEqual([]);
  });
});

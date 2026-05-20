import { describe, expect, it } from "vitest";
import { extractSearchPhrase } from "./searchPhrase.js";

describe("extractSearchPhrase", () => {
  it("extracts quoted phrases", () => {
    expect(extractSearchPhrase('What is the CiA equivalent of "rate qualifier"?')).toBe(
      "rate qualifier",
    );
  });

  it("strips question prefixes", () => {
    expect(extractSearchPhrase("Help me with CDD draft for council")).toBe(
      "cdd draft for council",
    );
  });
});

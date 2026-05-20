import { describe, expect, it } from "vitest";
import { buildSystemPrompt, deriveConversationTitle } from "./promptBuilder.js";

describe("promptBuilder", () => {
  it("includes page context and memories in the system prompt", () => {
    const prompt = buildSystemPrompt({
      preferences: {
        response_style: "concise",
        tone: "friendly",
        format: "bullets",
      },
      pageContext: {
        url: "https://example.com/docs",
        title: "Docs",
        selection: "Important text",
      },
      memories: [
        {
          question: "How do I deploy?",
          answer: "Use npm run build",
          pageUrl: "https://example.com/deploy",
        },
      ],
    });

    expect(prompt).toContain("https://example.com/docs");
    expect(prompt).toContain("How do I deploy?");
    expect(prompt).toContain("Use npm run build");
  });

  it("creates a short title from the first message", () => {
    expect(deriveConversationTitle("How do I make my chat smarter?")).toBe(
      "How do I make my chat smarter?",
    );
  });
});

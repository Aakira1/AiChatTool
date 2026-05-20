import { describe, expect, it } from "vitest";
import { OpenAiCompatibleAdapter } from "./openAiCompatibleAdapter.js";

describe("OpenAiCompatibleAdapter", () => {
  it("streams mock tokens when credentials are missing", async () => {
    const adapter = new OpenAiCompatibleAdapter({
      apiKey: "",
      baseUrl: "",
      model: "@cf/meta/llama-3.1-8b-instruct",
      missingConfigMessage: "Missing Cloudflare credentials.",
    });
    const chunks = [];

    for await (const token of adapter.streamGenerate({
      messages: [{ role: "user", content: "hello" }],
    })) {
      chunks.push(token);
    }

    expect(chunks.join("")).toContain("Missing Cloudflare credentials");
  });
});

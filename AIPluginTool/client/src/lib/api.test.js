import { describe, expect, it, vi } from "vitest";
import { streamChat } from "./api";

describe("streamChat", () => {
  it("parses SSE token chunks from fetch stream", async () => {
    const payload =
      'data: {"type":"token","token":"Hello"}\n\n' +
      'data: {"type":"token","token":" world"}\n\n' +
      "data: [DONE]\n\n";

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, body: stream })),
    );

    const tokens = [];
    await streamChat({
      conversationId: "conversation-1",
      message: "hello",
      onToken: (token) => tokens.push(token),
      onComplete: vi.fn(),
    });

    expect(tokens.join("")).toBe("Hello world");
  });
});

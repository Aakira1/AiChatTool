import { BaseLlmAdapter } from "./baseAdapter.js";

export class OpenAiCompatibleAdapter extends BaseLlmAdapter {
  constructor({ apiKey, baseUrl, model, missingConfigMessage }) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
    this.missingConfigMessage = missingConfigMessage;
  }

  async *streamGenerate({ messages, signal }) {
    if (!this.apiKey || !this.baseUrl) {
      const mock = this.missingConfigMessage;
      for (const token of mock.split(" ")) {
        yield `${token} `;
      }
      return;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        stream: true,
        messages,
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      const snippet = detail.slice(0, 280).trim();
      throw new Error(
        snippet
          ? `Workers AI error (${response.status}): ${snippet}`
          : `Workers AI request failed with status ${response.status}`,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const segments = buffer.split("\n\n");
      buffer = segments.pop() ?? "";

      for (const segment of segments) {
        const dataLine = segment
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (!dataLine) {
          continue;
        }
        const payload = dataLine.slice(6).trim();
        if (payload === "[DONE]") {
          return;
        }

        const parsed = JSON.parse(payload);
        const token = parsed?.choices?.[0]?.delta?.content ?? "";
        if (token) {
          yield token;
        }
      }
    }
  }
}

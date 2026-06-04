import { BaseLlmAdapter } from "./baseAdapter.js";

export class OpenAiCompatibleAdapter extends BaseLlmAdapter {
  constructor({ apiKey, baseUrl, model, maxTokens, missingConfigMessage }) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
    this.maxTokens = maxTokens;
    this.missingConfigMessage = missingConfigMessage;
  }

  // Maximum number of automatic continuation rounds when the model stops because
  // it hit the output token cap (finish_reason === "length"). Bounds cost while
  // letting long documents/checklists complete in a single seamless message.
  static MAX_CONTINUATIONS = 4;

  async *streamGenerate({ messages, signal }) {
    if (!this.apiKey || !this.baseUrl) {
      const mock = this.missingConfigMessage;
      for (const token of mock.split(" ")) {
        yield `${token} `;
      }
      return;
    }

    let convo = messages;
    let accumulated = "";

    for (let round = 0; round <= OpenAiCompatibleAdapter.MAX_CONTINUATIONS; round += 1) {
      const finishReason = yield* this.#streamOnce({ messages: convo, signal }, (token) => {
        accumulated += token;
      });

      // Stop unless the model was cut off by the length cap mid-output.
      if (finishReason !== "length" || !accumulated) {
        return;
      }

      // Re-prompt to continue exactly where it left off, carrying the partial
      // output as assistant context so the next chunk picks up seamlessly.
      convo = [
        ...messages,
        { role: "assistant", content: accumulated },
        {
          role: "user",
          content:
            "Continue your previous response from exactly where it stopped. Do not repeat or " +
            "re-introduce anything already written; output only the remaining content.",
        },
      ];
    }
  }

  // Streams a single request, forwarding tokens and reporting the finish reason.
  async *#streamOnce({ messages, signal }, onToken) {
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
        ...(this.maxTokens ? { max_tokens: this.maxTokens } : {}),
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
    let finishReason = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const segments = buffer.split("\n\n");
      buffer = segments.pop() ?? "";

      for (const segment of segments) {
        const dataLine = segment.split("\n").find((line) => line.startsWith("data: "));
        if (!dataLine) {
          continue;
        }
        const payload = dataLine.slice(6).trim();
        if (payload === "[DONE]") {
          return finishReason;
        }

        const parsed = JSON.parse(payload);
        const choice = parsed?.choices?.[0];
        if (choice?.finish_reason) {
          finishReason = choice.finish_reason;
        }
        const token = choice?.delta?.content ?? "";
        if (token) {
          onToken(token);
          yield token;
        }
      }
    }

    return finishReason;
  }
}

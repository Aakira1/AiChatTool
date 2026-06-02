import { getLlmConfig } from "../config/env.js";
import { OpenAiCompatibleAdapter } from "./llm/openAiCompatibleAdapter.js";

const adapter = new OpenAiCompatibleAdapter(getLlmConfig());

/** Collect an async token stream into a single trimmed string. */
async function collectStream(messages) {
  let text = "";
  for await (const token of adapter.streamGenerate({ messages })) {
    text += token;
  }
  return text.trim();
}

/**
 * Summarize a forum post together with its comments into a short digest.
 * Returns a plain string. Throws if the LLM request fails.
 */
export async function summarizeThread(post, comments = []) {
  const commentBlock = comments.length
    ? comments
        .map((c, i) => `Comment ${i + 1} (${c.author_name || c.author || "Anonymous"}): ${c.body}`)
        .join("\n")
    : "(no comments yet)";

  const thread = [
    `Title: ${post.title}`,
    `Author: ${post.author || "Anonymous"}`,
    "",
    `Post body:`,
    post.body || "(no body)",
    "",
    `Comments:`,
    commentBlock,
  ].join("\n");

  const messages = [
    {
      role: "system",
      content:
        "You summarize forum discussion threads for busy readers. Produce a concise summary " +
        "(3-5 sentences or short bullet points) that captures the main question, key points raised " +
        "in the comments, and any conclusion or unresolved questions. Be neutral and factual.",
    },
    {
      role: "user",
      content: `Summarize the following forum thread:\n\n${thread}`,
    },
  ];

  const summary = await collectStream(messages);
  return summary || "No summary could be generated for this thread.";
}

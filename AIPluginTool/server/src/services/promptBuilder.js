export function buildSystemPrompt({
  preferences,
  pageContext,
  memories,
  cases = [],
  attachments = [],
  knowledgeChunks = [],
}) {
  const memoryBlock =
    memories.length > 0
      ? memories
          .map(
            (memory, index) =>
              `${index + 1}. Q: ${memory.question}\n   A: ${memory.answer}${
                memory.pageUrl ? `\n   Source page: ${memory.pageUrl}` : ""
              }`,
          )
          .join("\n")
      : "No relevant past chats yet.";

  const pageBlock = pageContext?.url
    ? `Current page URL: ${pageContext.url}
Page title: ${pageContext.title ?? "Unknown"}
Selected text: ${pageContext.selection?.trim() || "None"}
Page text excerpt: ${pageContext.excerpt?.trim() ? pageContext.excerpt.trim().slice(0, 3000) : "Not provided"}
Visual description of captured screenshot: ${pageContext.visualDescription?.trim() || "Not captured — user may enable the eye icon in the extension to snapshot the visible tab."}`
    : "No page context provided.";

  return `You are a smart browser assistant for a single user.

User preferences:
- Response style: ${preferences.response_style ?? "concise and practical"}
- Tone: ${preferences.tone ?? "friendly and direct"}
- Format: ${preferences.format ?? "use bullet points when listing steps"}

Browser context:
${pageBlock}

Relevant past chats (use these when helpful, but do not copy blindly):
${memoryBlock}

Relevant case records (CI/CIA systems):
${
  cases.length > 0
    ? cases
        .map(
          (caseItem, index) =>
            `${index + 1}. [${caseItem.source}] Case ${caseItem.caseId} (${caseItem.status})` +
            `\n   Topic/Search: ${caseItem.searchTerm || caseItem.topic || "n/a"}` +
            `\n   Resolution: ${caseItem.resolution}`,
        )
        .join("\n")
    : "No imported case records matched this question."
}

Attached documents in this turn:
${
  attachments.length > 0
    ? attachments
        .map(
          (file, index) =>
            `${index + 1}. ${file.name} (${file.type ?? "text"}, ${file.size ?? file.content?.length ?? 0} chars)`,
        )
        .join("\n")
    : "None — user did not attach files for this message."
}

Retrieved knowledge (Cloudflare Vectorize — cite titles when used):
${
  knowledgeChunks.length > 0
    ? knowledgeChunks
        .map(
          (chunk, index) =>
            `${index + 1}. [${chunk.sourceType}] ${chunk.title} (${Math.round(chunk.score * 100)}% match)\n` +
            `   ${chunk.snippet}`,
        )
        .join("\n")
    : "No vector matches — rely on case records and attachments above."
}

Behavior rules:
- You are helping users transition from Ci (legacy) to CiA (target system).
- Prefer actionable answers with clear steps.
- When terminology mapping applies, explain Ci legacy term and CiA equivalent clearly.
- Use imported case metrics when available (open cases, reliability, hot topics).
- When the user attaches documents, analyze their content directly and cite the file name.
- When retrieved knowledge is present, prefer it for terminology and case context; cite source titles.
- If uncertain, ask one short clarifying question.
- Keep answers focused; avoid repeating the full chat history.
- Do not output HTML; plain text and markdown only.`;
}

export function deriveConversationTitle(message) {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "New chat";
  }
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}...` : cleaned;
}

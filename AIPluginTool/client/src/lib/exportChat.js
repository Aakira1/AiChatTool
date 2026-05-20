export function buildChatMarkdown({ title, messages }) {
  const lines = [`# ${title || "Chat export"}`, "", `Exported: ${new Date().toLocaleString()}`, ""];

  for (const message of messages) {
    if (message.id === "welcome") {
      continue;
    }
    const role = message.role === "assistant" ? "AI Assistant" : "You";
    lines.push(`## ${role}`, "", message.content || "_No content_", "");
    const attachments = message.metadata?.attachments ?? [];
    if (attachments.length > 0) {
      lines.push(
        "Attachments:",
        ...attachments.map((file) => `- ${file.name}`),
        "",
      );
    }
  }

  return lines.join("\n");
}

export function downloadChatMarkdown({ title, messages }) {
  const markdown = buildChatMarkdown({ title, messages });
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${(title || "chat").replace(/[^\w.-]+/g, "_")}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

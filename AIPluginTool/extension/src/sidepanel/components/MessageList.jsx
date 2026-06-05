import { forwardRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { InsightsArtifacts } from "./InsightsArtifacts.jsx";
import { FileDownloadCard } from "./FileDownloadCard.jsx";
import { MessageDownloadMenu } from "./MessageDownloadMenu.jsx";
import { MessageActions } from "./MessageActions.jsx";
import {
  parseFileBlocks,
  hasMarkdownTable,
  deriveFileTitle,
  detectRequestedDocFormats,
} from "../../lib/fileBlocks.js";

function AssistantContent({ content, requestedDocFormats }) {
  const { text, files, pending } = parseFileBlocks(content);

  // Fallback: model describes a spreadsheet with prose + markdown tables instead
  // of a clean ```spreadsheet JSON block → still offer a content-based download.
  let allFiles = files;
  if (!pending && !files.length && hasMarkdownTable(text)) {
    allFiles = [{ title: deriveFileTitle(content), content }];
  }

  // If the user explicitly asked to generate a document (pdf/word/etc.) and the
  // model didn't emit a document marker, surface a document card in the format
  // they requested anyway.
  if (
    !pending &&
    requestedDocFormats?.length &&
    !allFiles.some((f) => f.kind === "document") &&
    text
  ) {
    allFiles = [
      ...allFiles,
      {
        kind: "document",
        title: deriveFileTitle(content, "Document"),
        content,
        formats: requestedDocFormats,
      },
    ];
  }

  return (
    <>
      {text ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown> : null}
      {pending ? (
        <div className="cia-ext-file-card cia-ext-file-card-pending">
          <div className="cia-ext-file-icon" aria-hidden="true">
            XLS
          </div>
          <div className="cia-ext-file-meta">
            <div className="cia-ext-file-name">Generating file…</div>
            <div className="cia-ext-file-sub">Preparing your spreadsheet</div>
          </div>
          <span className="cia-ext-file-spinner" aria-hidden="true" />
        </div>
      ) : null}
      {allFiles.map((spec, index) => (
        <FileDownloadCard key={`${spec.title}-${index}`} spec={spec} />
      ))}
    </>
  );
}

export const MessageList = forwardRef(function MessageList(
  { messages, pending, onRegenerate, onRate, onPostToForum, lastAssistantId },
  ref,
) {
  return (
    <div className="cia-ext-messages" ref={ref}>
      {messages.map((message, index) => {
        const prevUser = [...messages.slice(0, index)]
          .reverse()
          .find((m) => m.role === "user");
        const requestedDocFormats =
          message.role === "assistant" ? detectRequestedDocFormats(prevUser?.content) : null;
        return (
        <article key={message.id} className={`cia-ext-message cia-ext-message-${message.role}`}>
          <div className="cia-ext-avatar" aria-hidden="true">
            {message.role === "assistant" ? "AI" : "You"}
          </div>
          <div className="cia-ext-bubble">
            {message.role === "assistant" ? (
              <>
                {message.content ? (
                  <AssistantContent
                    content={message.content}
                    requestedDocFormats={requestedDocFormats}
                  />
                ) : null}
                <InsightsArtifacts artifacts={message.metadata?.artifacts} />
              </>
            ) : (
              <p>{message.content}</p>
            )}
          </div>
          {message.role === "assistant" && message.content && message.id !== "welcome" ? (
            <div className="cia-ext-msg-tools">
              <MessageActions
                message={message}
                isLastAssistant={message.id === lastAssistantId}
                pending={pending}
                onRegenerate={onRegenerate}
                onRate={onRate}
                onPostToForum={onPostToForum}
              />
              <MessageDownloadMenu content={message.content} />
            </div>
          ) : null}
        </article>
        );
      })}
      {pending ? (
        <article className="cia-ext-message cia-ext-message-assistant">
          <div className="cia-ext-avatar" aria-hidden="true">
            AI
          </div>
          <div className="cia-ext-bubble cia-ext-bubble-pending">
            <span className="cia-ext-dot" />
            <span className="cia-ext-dot" />
            <span className="cia-ext-dot" />
          </div>
        </article>
      ) : null}
    </div>
  );
});

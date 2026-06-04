import { forwardRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { InsightsArtifacts } from "./InsightsArtifacts.jsx";
import { FileDownloadCard } from "./FileDownloadCard.jsx";
import { MessageDownloadMenu } from "./MessageDownloadMenu.jsx";
import { parseFileBlocks, hasMarkdownTable, deriveFileTitle } from "../../lib/fileBlocks.js";

function AssistantContent({ content }) {
  const { text, files, pending } = parseFileBlocks(content);

  // Fallback: model describes a spreadsheet with prose + markdown tables instead
  // of a clean ```spreadsheet JSON block → still offer a content-based download.
  let allFiles = files;
  if (!pending && !files.length && hasMarkdownTable(text)) {
    allFiles = [{ title: deriveFileTitle(content), content }];
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
      {text ? (
        <div className="cia-ext-msg-tools">
          <MessageDownloadMenu content={content} />
        </div>
      ) : null}
    </>
  );
}

export const MessageList = forwardRef(function MessageList({ messages, pending }, ref) {
  return (
    <div className="cia-ext-messages" ref={ref}>
      {messages.map((message) => (
        <article key={message.id} className={`cia-ext-message cia-ext-message-${message.role}`}>
          <div className="cia-ext-avatar" aria-hidden="true">
            {message.role === "assistant" ? "AI" : "You"}
          </div>
          <div className="cia-ext-bubble">
            {message.role === "assistant" ? (
              <>
                {message.content ? <AssistantContent content={message.content} /> : null}
                <InsightsArtifacts artifacts={message.metadata?.artifacts} />
              </>
            ) : (
              <p>{message.content}</p>
            )}
          </div>
        </article>
      ))}
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

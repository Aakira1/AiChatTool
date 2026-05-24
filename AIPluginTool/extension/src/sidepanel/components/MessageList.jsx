import { forwardRef } from "react";
import ReactMarkdown from "react-markdown";
import { InsightsArtifacts } from "./InsightsArtifacts.jsx";

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
                {message.content ? <ReactMarkdown>{message.content}</ReactMarkdown> : null}
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

import ReactMarkdown from "react-markdown";

export function MessageList({ messages, pending, onRateMessage }) {
  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      {messages.map((message) => (
        <article
          key={message.id}
          className={`rounded-xl p-3 ${
            message.role === "user"
              ? "ml-auto max-w-[85%] bg-cyan-500 text-slate-950"
              : "max-w-[95%] bg-slate-800 text-slate-100"
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wide opacity-70">{message.role}</span>
            {message.role === "assistant" && message.id && !message.id.startsWith("local-") ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onRateMessage(message.id, "up")}
                  className={`rounded px-2 py-0.5 text-xs ${
                    message.metadata?.feedback === "up"
                      ? "bg-emerald-500 text-slate-950"
                      : "border border-slate-600 text-slate-300"
                  }`}
                >
                  👍
                </button>
                <button
                  type="button"
                  onClick={() => onRateMessage(message.id, "down")}
                  className={`rounded px-2 py-0.5 text-xs ${
                    message.metadata?.feedback === "down"
                      ? "bg-red-500 text-white"
                      : "border border-slate-600 text-slate-300"
                  }`}
                >
                  👎
                </button>
              </div>
            ) : null}
          </div>
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{message.content || "_"}</ReactMarkdown>
          </div>
        </article>
      ))}

      {pending ? <div className="text-sm text-slate-400">Assistant is thinking...</div> : null}
    </div>
  );
}

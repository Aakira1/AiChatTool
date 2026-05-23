export function ConversationPicker({ threads, activeId, onSelect, onNew }) {
  return (
    <div className="cia-ext-threadbar">
      <select
        className="cia-ext-thread-select"
        value={activeId ?? ""}
        onChange={(event) => onSelect(event.target.value)}
        aria-label="Select conversation"
      >
        {threads.length === 0 ? <option value="">No conversations yet</option> : null}
        {threads.map((thread) => (
          <option key={thread.id} value={thread.id}>
            {thread.pinned ? "📌 " : ""}
            {thread.title || "Untitled"}
          </option>
        ))}
      </select>
      <button type="button" className="cia-ext-new-btn" onClick={onNew} title="New conversation">
        + New
      </button>
    </div>
  );
}

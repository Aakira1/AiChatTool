import { useState } from "react";

export function ConversationPicker({ threads, activeId, onSelect, onNew, onBulkDelete }) {
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (id) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const close = () => {
    setManaging(false);
    setSelected(new Set());
  };

  const handleDelete = async () => {
    if (!selected.size || busy) return;
    if (!window.confirm(`Delete ${selected.size} chat${selected.size === 1 ? "" : "s"}? This can't be undone.`))
      return;
    setBusy(true);
    try {
      await onBulkDelete?.([...selected]);
      close();
    } finally {
      setBusy(false);
    }
  };

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
      {onBulkDelete && threads.length > 0 ? (
        <button
          type="button"
          className="cia-ext-manage-btn"
          onClick={() => setManaging(true)}
          title="Select and delete chats"
          aria-label="Manage chats"
        >
          🗑
        </button>
      ) : null}

      {managing ? (
        <div className="cia-ext-manage-overlay" role="dialog" aria-label="Manage chats">
          <div className="cia-ext-manage-head">
            <strong>Delete chats</strong>
            <button type="button" className="cia-ext-icon-btn" onClick={close} aria-label="Close">
              ×
            </button>
          </div>
          <div className="cia-ext-manage-list">
            {threads.map((thread) => (
              <label key={thread.id} className="cia-ext-manage-row">
                <input
                  type="checkbox"
                  checked={selected.has(thread.id)}
                  onChange={() => toggle(thread.id)}
                />
                <span className="cia-ext-manage-title">
                  {thread.pinned ? "📌 " : ""}
                  {thread.title || "Untitled"}
                </span>
              </label>
            ))}
          </div>
          <div className="cia-ext-manage-foot">
            <button
              type="button"
              className="cia-ext-secondary-btn"
              onClick={() =>
                setSelected((cur) =>
                  cur.size === threads.length ? new Set() : new Set(threads.map((t) => t.id)),
                )
              }
            >
              {selected.size === threads.length ? "Select none" : "Select all"}
            </button>
            <button
              type="button"
              className="cia-ext-danger-btn"
              disabled={selected.size === 0 || busy}
              onClick={() => void handleDelete()}
            >
              {busy ? "Deleting…" : `Delete (${selected.size})`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

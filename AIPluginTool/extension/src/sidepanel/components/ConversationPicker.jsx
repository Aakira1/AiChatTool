import { useState } from "react";

export function ConversationPicker({ threads, activeId, onSelect, onNew, onBulkDelete }) {
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const activeThread = threads.find((t) => t.id === activeId);
  const currentLabel = activeThread
    ? `${activeThread.pinned ? "📌 " : ""}${activeThread.title || "Untitled"}`
    : threads.length === 0
      ? "New chat"
      : "Select a chat";

  const pick = (id) => {
    onSelect(id);
    setMenuOpen(false);
  };

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
      <div className="cia-ext-thread-dropdown">
        <button
          type="button"
          className="cia-ext-thread-trigger"
          onClick={() => threads.length > 0 && setMenuOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          disabled={threads.length === 0}
          title={currentLabel}
        >
          <span className="cia-ext-thread-current">{currentLabel}</span>
          {threads.length > 0 ? (
            <span className={`cia-ext-thread-chevron${menuOpen ? " is-open" : ""}`} aria-hidden="true">⌄</span>
          ) : null}
        </button>

        {menuOpen ? (
          <>
            <div className="cia-ext-thread-backdrop" onClick={() => setMenuOpen(false)} />
            <ul className="cia-ext-thread-menu" role="listbox">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={thread.id === activeId}
                    className={`cia-ext-thread-option${thread.id === activeId ? " is-active" : ""}`}
                    onClick={() => pick(thread.id)}
                  >
                    {thread.pinned ? "📌 " : ""}
                    {thread.title || "Untitled"}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

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

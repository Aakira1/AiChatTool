import { useState } from "react";

export function CiaThreadList({
  threads,
  archivedThreads = [],
  activeId,
  deletingId,
  showArchived,
  onToggleArchived,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onPin,
  onArchive,
  onBulkDelete,
  collapsed = false,
  onToggleCollapsed,
}) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());

  const toggleSelected = (id) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const allVisible = [...threads, ...(showArchived ? archivedThreads : [])];

  const handleBulkDelete = async () => {
    if (!selected.size) return;
    await onBulkDelete?.([...selected]);
    exitSelectMode();
  };

  const startRename = (thread) => {
    setRenamingId(thread.id);
    setRenameValue(thread.title);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const commitRename = (thread) => {
    onRename?.(thread, renameValue);
    cancelRename();
  };
  if (collapsed) {
    return (
      <aside className="cia-threads cia-threads-collapsed">
        <button
          type="button"
          className="cia-collapse-rail-btn"
          onClick={onToggleCollapsed}
          title="Expand chats"
          aria-label="Expand chats"
        >
          <span className="cia-collapse-rail-label">Chats</span>
          <span aria-hidden="true">»</span>
        </button>
      </aside>
    );
  }
  const renderThread = (thread) => (
    <div
      key={thread.id}
      className={`cia-thread-item ${thread.id === activeId ? "active" : ""} ${thread.archived ? "archived" : ""}${
        selectMode && selected.has(thread.id) ? " is-selected" : ""
      }`}
    >
      {selectMode ? (
        <label className="cia-thread-checkrow">
          <input
            type="checkbox"
            checked={selected.has(thread.id)}
            onChange={() => toggleSelected(thread.id)}
          />
          <span className="cia-thread-title">
            {thread.pinned ? "📌 " : ""}
            {thread.title}
          </span>
          <span className="cia-thread-date">
            {thread.createdAt ? new Date(thread.createdAt).toLocaleDateString() : ""}
          </span>
        </label>
      ) : renamingId === thread.id ? (
        <input
          type="text"
          className="cia-thread-rename-input"
          value={renameValue}
          autoFocus
          onChange={(event) => setRenameValue(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitRename(thread);
            } else if (event.key === "Escape") {
              cancelRename();
            }
          }}
          onBlur={() => commitRename(thread)}
        />
      ) : (
        <button
          type="button"
          className="cia-thread-select"
          onClick={() => onSelect(thread.id)}
          title={thread.title}
        >
          <span className="cia-thread-title">
            {thread.pinned ? "📌 " : ""}
            {thread.title}
          </span>
          <span className="cia-thread-date">
            {thread.createdAt ? new Date(thread.createdAt).toLocaleDateString() : ""}
          </span>
        </button>
      )}
      {selectMode ? null : (
      <div className="cia-thread-actions">
        <button
          type="button"
          className="cia-thread-action"
          onClick={(event) => {
            event.stopPropagation();
            onPin?.(thread);
          }}
          title={thread.pinned ? "Unpin" : "Pin"}
        >
          {thread.pinned ? "★" : "☆"}
        </button>
        <button
          type="button"
          className="cia-thread-action"
          onClick={(event) => {
            event.stopPropagation();
            startRename(thread);
          }}
          title="Rename"
        >
          ✎
        </button>
        <button
          type="button"
          className="cia-thread-action"
          onClick={(event) => {
            event.stopPropagation();
            onArchive?.(thread);
          }}
          title={thread.archived ? "Restore" : "Archive"}
        >
          {thread.archived ? "↩" : "📦"}
        </button>
        <button
          type="button"
          className="cia-thread-delete"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(thread);
          }}
          disabled={deletingId === thread.id}
          aria-label={`Delete chat: ${thread.title}`}
          title="Delete chat"
        >
          {deletingId === thread.id ? "…" : "🗑"}
        </button>
      </div>
      )}
    </div>
  );

  return (
    <aside className="cia-threads">
      <div className="cia-threads-header">
        <h2>Chats</h2>
        <div className="cia-threads-header-actions">
          {selectMode ? (
            <>
              <button
                type="button"
                className="cia-threads-new"
                onClick={() =>
                  setSelected((cur) =>
                    cur.size === allVisible.length
                      ? new Set()
                      : new Set(allVisible.map((t) => t.id)),
                  )
                }
              >
                {selected.size === allVisible.length ? "None" : "All"}
              </button>
              <button
                type="button"
                className="cia-threads-bulk-delete"
                onClick={() => void handleBulkDelete()}
                disabled={selected.size === 0}
              >
                Delete ({selected.size})
              </button>
              <button type="button" className="cia-threads-new" onClick={exitSelectMode}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" className="cia-threads-new" onClick={onCreate}>
                + New
              </button>
              {onBulkDelete && (threads.length > 0 || archivedThreads.length > 0) ? (
                <button
                  type="button"
                  className="cia-threads-new"
                  onClick={() => setSelectMode(true)}
                  title="Select chats to delete"
                >
                  Select
                </button>
              ) : null}
              <button
                type="button"
                className="cia-collapse-btn"
                onClick={onToggleCollapsed}
                title="Collapse chats"
                aria-label="Collapse chats"
              >
                «
              </button>
            </>
          )}
        </div>
      </div>

      <div className="cia-threads-list">
        {threads.length === 0 && archivedThreads.length === 0 ? (
          <p className="cia-threads-empty">No chats yet. Start a new conversation.</p>
        ) : (
          <>
            {threads.map(renderThread)}
            {archivedThreads.length > 0 ? (
              <>
                <button
                  type="button"
                  className="cia-threads-archived-toggle"
                  onClick={onToggleArchived}
                >
                  {showArchived ? "Hide archived" : `Show archived (${archivedThreads.length})`}
                </button>
                {showArchived ? archivedThreads.map(renderThread) : null}
              </>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}

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
  collapsed = false,
  onToggleCollapsed,
}) {
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
      className={`cia-thread-item ${thread.id === activeId ? "active" : ""} ${thread.archived ? "archived" : ""}`}
    >
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
            onRename?.(thread);
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
    </div>
  );

  return (
    <aside className="cia-threads">
      <div className="cia-threads-header">
        <h2>Chats</h2>
        <div className="cia-threads-header-actions">
          <button type="button" className="cia-threads-new" onClick={onCreate}>
            + New
          </button>
          <button
            type="button"
            className="cia-collapse-btn"
            onClick={onToggleCollapsed}
            title="Collapse chats"
            aria-label="Collapse chats"
          >
            «
          </button>
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

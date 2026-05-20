export function ThreadList({ threads, activeId, onSelect, onCreate, onDelete }) {
  return (
    <aside className="w-80 border-r border-slate-700 bg-slate-900/60">
      <div className="flex items-center justify-between border-b border-slate-700 p-4">
        <h1 className="text-base font-semibold">AI Chat</h1>
        <button
          type="button"
          className="rounded-md border border-slate-600 px-3 py-1 text-xs"
          onClick={onCreate}
        >
          New
        </button>
      </div>
<ul className="space-y-1 p-2">
  {threads.map((thread) => (
    <li key={thread.id} className="group relative flex items-center">
      <button
        type="button"
        onClick={() => onSelect(thread.id)}
        className={`w-full rounded-md px-3 py-2 text-left text-sm ${
          thread.id === activeId
            ? "bg-cyan-500 text-slate-950"
            : "hover:bg-slate-800"
        }`}
      >
        {thread.title}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void onDelete(thread.id);
        }}
        className="absolute right-2 hidden text-red-400 hover:text-red-600 group-hover:block"
      >
        ✕
      </button>
    </li>
  ))}
</ul>
    </aside>
  );
}

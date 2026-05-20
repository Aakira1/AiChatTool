import { useState } from "react";

export function Composer({ disabled, onSubmit, onCancel }) {
  const [value, setValue] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!value.trim()) {
      return;
    }
    onSubmit(value.trim());
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-slate-700 p-4">
      <label htmlFor="chat-input" className="mb-2 block text-sm text-slate-400">
        Message
      </label>
      <textarea
        id="chat-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-28 w-full rounded-lg border border-slate-600 bg-slate-900 p-3 text-sm text-slate-100 outline-none ring-cyan-500 focus:ring-2"
        placeholder="Ask anything..."
        disabled={disabled}
      />
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
          disabled={disabled || !value.trim()}
        >
          Send
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 disabled:opacity-40"
          disabled={!disabled}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

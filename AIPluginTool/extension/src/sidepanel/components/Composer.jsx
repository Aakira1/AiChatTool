import { useEffect, useRef } from "react";

export function Composer({ value, onChange, onSubmit, onStop, pending }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!pending && value.trim()) onSubmit();
    }
  };

  return (
    <form
      className="cia-ext-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending && value.trim()) onSubmit();
      }}
    >
      <textarea
        ref={textareaRef}
        className="cia-ext-textarea"
        placeholder="Ask about CiA terminology, processes, cases, or this page…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
      />
      {pending ? (
        <button type="button" className="cia-ext-stop-btn" onClick={onStop}>
          Stop
        </button>
      ) : (
        <button
          type="submit"
          className="cia-ext-send-btn"
          disabled={!value.trim()}
          aria-label="Send"
        >
          Send →
        </button>
      )}
    </form>
  );
}

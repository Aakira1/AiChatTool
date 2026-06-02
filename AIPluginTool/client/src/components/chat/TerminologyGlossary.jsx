import { useEffect, useMemo, useState } from "react";
import { addTerminology, deleteTerminology, getTerminology } from "../../lib/api.js";

export function TerminologyGlossary({ onAsk }) {
  const [mappings, setMappings] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ciTerm: "", ciaTerm: "", notes: "" });

  const load = () =>
    getTerminology()
      .then((data) => setMappings(data.mappings ?? []))
      .catch((loadError) => setError(loadError.message));

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) {
      return mappings;
    }
    return mappings.filter(
      (entry) =>
        entry.ciTerm.toLowerCase().includes(lower) ||
        entry.ciaTerm.toLowerCase().includes(lower) ||
        entry.notes?.some((note) => note.toLowerCase().includes(lower)),
    );
  }, [mappings, query]);

  const resetForm = () => {
    setForm({ ciTerm: "", ciaTerm: "", notes: "" });
    setAdding(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.ciTerm.trim() || !form.ciaTerm.trim()) {
      setError("Enter both the Ci and CiA terms.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const notes = form.notes
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      await addTerminology({
        ciTerm: form.ciTerm.trim(),
        ciaTerm: form.ciaTerm.trim(),
        notes,
      });
      await load();
      resetForm();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteTerminology(id);
      setMappings((current) => current.filter((entry) => entry.id !== id));
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  return (
    <div className="cia-glossary">
      <div className="cia-glossary-toolbar">
        <input
          type="search"
          className="cia-glossary-search"
          placeholder="Search Ci → CiA terms..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className="cia-glossary-add-btn"
          onClick={() => setAdding((value) => !value)}
          title="Add a term"
        >
          {adding ? "×" : "+ Add"}
        </button>
      </div>

      {adding ? (
        <form className="cia-glossary-form" onSubmit={handleSubmit}>
          <input
            className="cia-glossary-input"
            placeholder="Ci term (legacy)"
            value={form.ciTerm}
            onChange={(event) => setForm((f) => ({ ...f, ciTerm: event.target.value }))}
            autoFocus
          />
          <input
            className="cia-glossary-input"
            placeholder="CiA term (target)"
            value={form.ciaTerm}
            onChange={(event) => setForm((f) => ({ ...f, ciaTerm: event.target.value }))}
          />
          <textarea
            className="cia-glossary-input cia-glossary-textarea"
            placeholder="Notes (one per line, optional)"
            rows={3}
            value={form.notes}
            onChange={(event) => setForm((f) => ({ ...f, notes: event.target.value }))}
          />
          <div className="cia-glossary-form-actions">
            <button type="button" className="cia-glossary-cancel" onClick={resetForm}>
              Cancel
            </button>
            <button type="submit" className="cia-glossary-save" disabled={saving}>
              {saving ? "Saving…" : "Save term"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="cia-glossary-error">{error}</p> : null}

      <div className="cia-glossary-list">
        {filtered.map((entry) => (
          <article key={entry.id ?? entry.ciTerm} className="cia-glossary-card">
            <div className="cia-term-card compact">
              <div>
                <div className="cia-term-label">Ci (Legacy)</div>
                <div className="cia-term-value">{entry.ciTerm}</div>
              </div>
              <div className="cia-term-arrow">→</div>
              <div>
                <div className="cia-term-label">CiA (Target)</div>
                <div className="cia-term-value">{entry.ciaTerm}</div>
              </div>
            </div>
            <ul className="cia-glossary-notes">
              {entry.notes?.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <div className="cia-glossary-card-actions">
              <button
                type="button"
                className="cia-glossary-ask"
                onClick={() =>
                  onAsk?.(`What's the CiA equivalent of ${entry.ciTerm}? Explain migration notes.`)
                }
              >
                Ask AI about this
              </button>
              {entry.id ? (
                <button
                  type="button"
                  className="cia-glossary-delete"
                  onClick={() => handleDelete(entry.id)}
                  title="Delete term"
                >
                  Delete
                </button>
              ) : null}
            </div>
          </article>
        ))}
        {filtered.length === 0 && !error ? (
          <p className="text-sm text-[var(--t1-muted)]">No terminology matches your search.</p>
        ) : null}
      </div>
    </div>
  );
}

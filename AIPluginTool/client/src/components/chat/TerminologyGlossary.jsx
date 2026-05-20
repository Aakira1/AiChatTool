import { useEffect, useMemo, useState } from "react";
import { getTerminology } from "../../lib/api.js";

export function TerminologyGlossary({ onAsk }) {
  const [mappings, setMappings] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getTerminology()
      .then((data) => setMappings(data.mappings ?? []))
      .catch((loadError) => setError(loadError.message));
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

  return (
    <div className="cia-glossary">
      <input
        type="search"
        className="cia-glossary-search"
        placeholder="Search Ci → CiA terms..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {error ? <p className="cia-glossary-error">{error}</p> : null}

      <div className="cia-glossary-list">
        {filtered.map((entry) => (
          <article key={entry.ciTerm} className="cia-glossary-card">
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
            <button
              type="button"
              className="cia-glossary-ask"
              onClick={() =>
                onAsk?.(`What's the CiA equivalent of ${entry.ciTerm}? Explain migration notes.`)
              }
            >
              Ask AI about this
            </button>
          </article>
        ))}
        {filtered.length === 0 && !error ? (
          <p className="text-sm text-[var(--t1-muted)]">No terminology matches your search.</p>
        ) : null}
      </div>
    </div>
  );
}

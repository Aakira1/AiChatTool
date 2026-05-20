export function KpiCard({ label, value, hint, tone = "default" }) {
  const toneClass =
    tone === "positive"
      ? "t1-kpi-value-positive"
      : tone === "negative"
        ? "t1-kpi-value-negative"
        : "t1-kpi-value";

  return (
    <article className="t1-panel t1-animate-in p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--t1-gray)]">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--t1-muted)]">{hint}</p> : null}
    </article>
  );
}

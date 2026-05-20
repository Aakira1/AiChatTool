export function BarChart({ title, series }) {
  const max = Math.max(...series.flatMap((item) => [item.ci, item.cia]), 1);

  return (
    <section className="t1-panel t1-animate-in p-4">
      <h3 className="mb-4 text-sm font-semibold text-white">{title}</h3>
      <div className="space-y-3">
        {series.map((item) => (
          <div key={item.date}>
            <div className="mb-1 text-xs text-[var(--t1-gray)]">{item.date}</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1 text-[10px] text-[var(--t1-magenta)]">CI</div>
                <div className="h-2 rounded bg-[#3a2550]">
                  <div
                    className="h-2 rounded bg-[var(--t1-magenta)]"
                    style={{ width: `${(item.ci / max) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] text-[var(--t1-orange)]">CIA</div>
                <div className="h-2 rounded bg-[#3a2550]">
                  <div
                    className="h-2 rounded bg-[var(--t1-orange)]"
                    style={{ width: `${(item.cia / max) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

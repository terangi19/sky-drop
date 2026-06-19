"use client";

export function MiniBarChart({
  data,
  label,
}: {
  data: Array<{ date: string; count: number }>;
  label: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const recent = data.slice(-14);

  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4">
      <p className="mb-3 text-sm font-bold text-[var(--foreground)]">{label}</p>
      <div className="flex h-28 items-end gap-1">
        {recent.map((d) => (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-sky-500/70"
              style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
              title={`${d.date}: ${d.count}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-[var(--muted)]">
        <span>{recent[0]?.date?.slice(5)}</span>
        <span>{recent[recent.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  );
}

export function CategoryList({
  items,
  label,
}: {
  items: Array<{ name: string; count: number }>;
  label: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4">
      <p className="mb-3 text-sm font-bold text-[var(--foreground)]">{label}</p>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No data yet</p>
        ) : (
          items.map((item) => (
            <div key={item.name}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-[var(--foreground)]">{item.name}</span>
                <span className="tabular-nums text-[var(--muted)]">{item.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5">
                <div className="h-full rounded-full bg-sky-500/60" style={{ width: `${(item.count / max) * 100}%` }} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

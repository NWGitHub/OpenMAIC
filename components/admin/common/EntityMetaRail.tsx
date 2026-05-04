interface EntityMetaItem {
  label: string;
  value: string;
}

interface EntityMetaRailProps {
  title: string;
  items: EntityMetaItem[];
}

export function EntityMetaRail({ title, items }: EntityMetaRailProps) {
  return (
    <aside className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      <dl className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-white/5 pb-2 last:border-0">
            <dt className="text-xs uppercase tracking-wider text-slate-500">{item.label}</dt>
            <dd className="text-sm text-slate-700 dark:text-slate-200">{item.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

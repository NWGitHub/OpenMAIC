interface ReviewDiffItem {
  label: string;
  value: string;
}

interface ReviewDiffCardProps {
  title: string;
  items: ReviewDiffItem[];
}

export function ReviewDiffCard({ title, items }: ReviewDiffCardProps) {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      <dl className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-white/5 pb-2 last:border-0">
            <dt className="text-sm text-slate-500 dark:text-slate-400">{item.label}</dt>
            <dd className="text-sm font-medium text-slate-900 dark:text-white">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

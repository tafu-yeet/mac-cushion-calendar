import { dateParts, otherYear } from "@/lib/time";

/** The oversized "09 / OCT" date at the top of a page, with a small label above it. */
export function BigDate({ date, today, label }: { date: string; today: string; label?: string }) {
  const { weekday, day, month } = dateParts(date);
  const year = otherYear(date, today) ? ` · ${date.slice(0, 4)}` : "";
  return (
    <div>
      <p className="text-sm font-medium text-maroon/75">
        {label ?? weekday}
        {year}
      </p>
      <p className="mt-2 font-display text-[5.25rem] font-semibold leading-[0.82] tracking-[-0.03em] sm:text-[6.5rem]">
        {day}
        <br />
        {month}
      </p>
    </div>
  );
}

/** Figures beside the big date, split from it by a thin rule, like a clock's second time zone. */
export function DateStats({ stats }: { stats: { value: string | number; label: string }[] }) {
  return (
    <div className="flex flex-col gap-3 border-l border-maroon/30 pb-1 pl-4">
      {stats.map((s) => (
        <div key={s.label}>
          <p className="font-display text-2xl font-semibold leading-none">{s.value}</p>
          <p className="mt-1 text-xs text-maroon/75">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

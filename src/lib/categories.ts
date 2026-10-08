// The calendar's sections. The worker's extractor picks one per event
// (worker/extractors/base.py); keys match the events.category check constraint.
// Class names are written out in full so Tailwind finds them.

export const CATEGORIES = [
  { key: "social", label: "Social", dot: "bg-violet-500", block: "border-violet-200 bg-violet-50 text-violet-950 hover:bg-violet-100" },
  { key: "sports", label: "Sports & fitness", dot: "bg-sky-500", block: "border-sky-200 bg-sky-50 text-sky-950 hover:bg-sky-100" },
  { key: "arts", label: "Arts & culture", dot: "bg-pink-500", block: "border-pink-200 bg-pink-50 text-pink-950 hover:bg-pink-100" },
  { key: "learn", label: "Learn & career", dot: "bg-amber-500", block: "border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100" },
  { key: "give", label: "Give back", dot: "bg-teal-500", block: "border-teal-200 bg-teal-50 text-teal-950 hover:bg-teal-100" },
  { key: "meetings", label: "Club meetings", dot: "bg-indigo-500", block: "border-indigo-200 bg-indigo-50 text-indigo-950 hover:bg-indigo-100" },
  { key: "other", label: "Other", dot: "bg-stone-400", block: "border-stone-200 bg-stone-50 text-stone-900 hover:bg-stone-100" },
] as const;

export type Category = (typeof CATEGORIES)[number]["key"];

export function isCategory(value: string): value is Category {
  return CATEGORIES.some((c) => c.key === value);
}

export function categoryOf(key: string) {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
}

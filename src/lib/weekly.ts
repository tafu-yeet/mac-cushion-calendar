// Weekly programs (worker/series.py): the days they run, in words.

const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * "Every Tue–Fri", "Every Tue", "Every Mon & Wed" (ISO days: 1 is Monday, 7 Sunday);
 * `long` spells them out: "Every Tuesday to Friday", "Every Monday and Wednesday".
 */
export function everyDays(days: number[], long = false): string {
  const sorted = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  const name = (d: number) => (long ? LONG : SHORT)[d - 1];
  if (sorted.length > 2 && sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)) {
    return `Every ${name(sorted[0])}${long ? " to " : "–"}${name(sorted[sorted.length - 1])}`;
  }
  const names = sorted.map(name);
  const and = long ? " and " : " & ";
  return `Every ${names.length > 1 ? `${names.slice(0, -1).join(", ")}${and}${names[names.length - 1]}` : names[0] ?? ""}`;
}

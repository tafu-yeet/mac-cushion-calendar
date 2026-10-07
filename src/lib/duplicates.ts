// Groups review-queue events that are probably the same event, including
// reposts across accounts (a hub page sharing a club's event). Two events on
// the same campus-local day match when they come from the same account, when
// one's "hosted by" names the other's club, or when they have similar names,
// start times that don't disagree, and the same place. The place is required
// so two clubs' "General Meeting"s at 6 pm aren't treated as one event.

export type DuplicateCandidate = {
  clubId: number;
  clubName: string;
  clubUsername: string;
  hostedBy: string | null;
  name: string;
  location: string | null;
  startDate: string; // campus-local "YYYY-MM-DD", "" when unknown
  startTime: string; // campus-local "HH:MM", "" when unknown
};

const SIMILAR_NAMES = 0.6;
const SAME_PLACE = 0.5;
// Words that every club name shares and that say nothing about which event it is.
const FILLER = new Set(["mcmaster", "mac", "the", "a", "an", "of", "at", "and", "x", "with", "club", "society", "association"]);

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .join(" ");
}

/** Dice coefficient over character pairs: 1 for identical names, 0 for nothing in common. */
export function nameSimilarity(a: string, b: string): number {
  const pairs = (s: string) => {
    const counts = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) counts.set(s.slice(i, i + 2), (counts.get(s.slice(i, i + 2)) ?? 0) + 1);
    return counts;
  };
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const px = pairs(x);
  const py = pairs(y);
  let shared = 0;
  for (const [pair, n] of px) shared += Math.min(n, py.get(pair) ?? 0);
  const total = Math.max(x.length - 1, 0) + Math.max(y.length - 1, 0);
  return total ? (2 * shared) / total : 0;
}

function namesClub(hostedBy: string | null, club: DuplicateCandidate): boolean {
  if (!hostedBy) return false;
  const host = hostedBy.toLowerCase();
  return (
    (!!club.clubUsername && host.includes(`@${club.clubUsername.toLowerCase()}`)) ||
    (!!club.clubName && host.includes(club.clubName.toLowerCase()))
  );
}

export function sameEvent(a: DuplicateCandidate, b: DuplicateCandidate): boolean {
  if (!a.startDate || a.startDate !== b.startDate) return false;
  if (a.clubId === b.clubId) return true;
  if (namesClub(a.hostedBy, b) || namesClub(b.hostedBy, a)) return true;
  const timesAgree = !a.startTime || !b.startTime || a.startTime === b.startTime;
  const samePlace = !!a.location && !!b.location && nameSimilarity(a.location, b.location) >= SAME_PLACE;
  return timesAgree && samePlace && nameSimilarity(a.name, b.name) >= SIMILAR_NAMES;
}

/** Groups in order of each group's first event; undated events stay on their own. */
export function groupDuplicates<T extends DuplicateCandidate>(events: T[]): T[][] {
  const parent = events.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));

  const byDate = new Map<string, number[]>();
  events.forEach((e, i) => {
    if (e.startDate) byDate.set(e.startDate, [...(byDate.get(e.startDate) ?? []), i]);
  });
  for (const indexes of byDate.values()) {
    for (let x = 0; x < indexes.length; x++) {
      for (let y = x + 1; y < indexes.length; y++) {
        if (sameEvent(events[indexes[x]], events[indexes[y]])) parent[find(indexes[x])] = find(indexes[y]);
      }
    }
  }

  const groups = new Map<number, T[]>();
  events.forEach((e, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), e]));
  return [...groups.values()];
}

// Groups review-queue events that are probably the same event. Events from
// one post are never duplicates (the model already split them). Otherwise two
// events match when:
// - they're on the same campus-local day and come from the same account with
//   similar names, or one's "hosted by" names the other's club (a hub repost
//   or collab), or they have similar names, start times that don't disagree,
//   and the same place (so two clubs' 6 pm "General Meeting"s in different
//   rooms stay apart);
// - one has no date and the same account posted a similar-named event (a
//   "tickets dropping soon" teaser for an event announced elsewhere);
// - the same account posted near-identical names a few days apart in
//   different posts (a misread or changed date). These get flagged, since one
//   of the dates is wrong, and are never rejected in one click.
// A post that lists one event on several dates (a show's run, a biweekly
// series) is a series, not duplicates, so its dates never merge.

export type DuplicateCandidate = {
  postId: string;
  clubId: number;
  clubName: string;
  clubUsername: string;
  hostedBy: string | null;
  name: string;
  location: string | null;
  startDate: string; // campus-local "YYYY-MM-DD", "" when unknown
  startTime: string; // campus-local "HH:MM", "" when unknown
};

const SIMILAR_NAMES = 0.6; // for both measures below
const NEAR_IDENTICAL_NAMES = 0.8;
const SAME_PLACE = 0.5;
const NEAR_DATE_DAYS = 6; // under a week, so weekly events never merge
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

/**
 * Share of the shorter name's words found in the longer one, so "Marketing Lab"
 * matches "Marketing Lab: Meet the Hosts". Unlike character pairs it isn't
 * fooled by common words: "Pizza Night" vs "Game Night" is 0.5.
 */
export function wordOverlap(a: string, b: string): number {
  // Single letters (the "s" left from "McMaster's") carry no meaning.
  const words = (s: string) => new Set(normalize(s).split(" ").filter((w) => w.length > 1 || /\d/.test(w)));
  const x = words(a);
  const y = words(b);
  // One shared word is too little to go on: "MIMC" inside "Quran Competition (MIMC)".
  if (Math.min(x.size, y.size) < 2) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / Math.min(x.size, y.size);
}

export function similarNames(a: string, b: string): boolean {
  return wordOverlap(a, b) >= SIMILAR_NAMES || nameSimilarity(a, b) >= SIMILAR_NAMES;
}

function namesClub(hostedBy: string | null, club: DuplicateCandidate): boolean {
  if (!hostedBy) return false;
  const host = hostedBy.toLowerCase();
  return (
    (!!club.clubUsername && host.includes(`@${club.clubUsername.toLowerCase()}`)) ||
    (!!club.clubName && host.includes(club.clubName.toLowerCase()))
  );
}

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/** Events that belong to a multi-date series: similar names on different dates in one post. */
function seriesMembers<T extends DuplicateCandidate>(events: T[]): Set<T> {
  const byPost = new Map<string, T[]>();
  events.forEach((e) => byPost.set(e.postId, [...(byPost.get(e.postId) ?? []), e]));
  const series = new Set<T>();
  for (const members of byPost.values()) {
    for (const a of members) {
      for (const b of members) {
        if (a !== b && a.startDate && b.startDate && a.startDate !== b.startDate && similarNames(a.name, b.name)) {
          series.add(a);
          series.add(b);
        }
      }
    }
  }
  return series;
}

type Match = "same" | "dates-differ" | null;

export function compareEvents(
  a: DuplicateCandidate,
  b: DuplicateCandidate,
  inSeries: (e: DuplicateCandidate) => boolean = () => false,
): Match {
  if (a.postId === b.postId) return null;
  if (a.startDate && a.startDate === b.startDate) {
    if (a.clubId === b.clubId) return similarNames(a.name, b.name) ? "same" : null;
    if (namesClub(a.hostedBy, b) || namesClub(b.hostedBy, a)) return "same";
    const timesAgree = !a.startTime || !b.startTime || a.startTime === b.startTime;
    const samePlace = !!a.location && !!b.location && nameSimilarity(a.location, b.location) >= SAME_PLACE;
    return timesAgree && samePlace && similarNames(a.name, b.name) ? "same" : null;
  }
  // Different or missing dates: only the same account posting it again.
  if (a.clubId !== b.clubId) return null;
  if (!a.startDate || !b.startDate) return similarNames(a.name, b.name) ? "same" : null;
  if (inSeries(a) || inSeries(b)) return null;
  const gap = Math.abs(dayNumber(a.startDate) - dayNumber(b.startDate));
  return gap <= NEAR_DATE_DAYS && nameSimilarity(a.name, b.name) >= NEAR_IDENTICAL_NAMES ? "dates-differ" : null;
}

/** Groups in order of each group's first event. */
export function groupDuplicates<T extends DuplicateCandidate>(events: T[]): T[][] {
  const series = seriesMembers(events);
  const inSeries = (e: DuplicateCandidate) => series.has(e as T);
  const parent = events.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));

  // Only events from the same day or the same account can match, so compare within those buckets.
  const buckets = new Map<string, number[]>();
  events.forEach((e, i) => {
    for (const key of [e.startDate && `day:${e.startDate}`, `club:${e.clubId}`]) {
      if (key) buckets.set(key, [...(buckets.get(key) ?? []), i]);
    }
  });
  for (const indexes of buckets.values()) {
    for (let x = 0; x < indexes.length; x++) {
      for (let y = x + 1; y < indexes.length; y++) {
        const [i, j] = [indexes[x], indexes[y]];
        if (find(i) !== find(j) && compareEvents(events[i], events[j], inSeries)) parent[find(i)] = find(j);
      }
    }
  }

  const groups = new Map<number, T[]>();
  events.forEach((e, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), e]));
  return [...groups.values()];
}

/** Group members that "approve this, reject the rest" may reject: never one with a different date. */
export function rejectableDuplicates<T extends DuplicateCandidate>(event: T, group: T[]): T[] {
  return group.filter(
    (other) => other !== event && (event.startDate ? !other.startDate || other.startDate === event.startDate : !other.startDate),
  );
}

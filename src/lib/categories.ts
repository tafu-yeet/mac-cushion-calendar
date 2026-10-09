// The calendar's sections. The worker's extractor picks one per event
// (worker/extractors/base.py); keys match the events.category check constraint.
// Colours are the brand's, from app/globals.css. Class names are written out
// in full so Tailwind finds them.

/** One brand colour as a card, with what reads well on and around it. */
export type Tone = {
  card: string; // background and text
  chip: string; // small pills on the card (durations, week-view events)
  accent: string; // the free-food highlight: gold and maroon, whichever stands out here
  button: string; // the main button on the card
  swatch: string; // a small dot of the colour, for legends and markers
  line: string; // hairlines on the card
  hex: { bg: string; ink: string }; // for the share image
};

export const TONES = {
  maroon: {
    card: "bg-maroon text-cream",
    chip: "bg-gold text-maroon",
    accent: "bg-gold text-maroon",
    button: "bg-cream text-maroon hover:bg-white",
    swatch: "bg-maroon ring-1 ring-current/40",
    line: "border-cream/25",
    hex: { bg: "#7a1f3d", ink: "#fff4e6" },
  },
  gold: {
    card: "bg-gold text-maroon",
    chip: "bg-maroon text-cream",
    accent: "bg-maroon text-gold",
    button: "bg-maroon text-cream hover:bg-plum",
    swatch: "bg-gold ring-1 ring-current/40",
    line: "border-maroon/20",
    hex: { bg: "#f9b93b", ink: "#7a1f3d" },
  },
  blush: {
    card: "bg-blush text-maroon",
    chip: "bg-maroon text-cream",
    accent: "bg-gold text-maroon",
    button: "bg-maroon text-cream hover:bg-plum",
    swatch: "bg-blush ring-1 ring-current/40",
    line: "border-maroon/20",
    hex: { bg: "#f7bccb", ink: "#7a1f3d" },
  },
  mauve: {
    card: "bg-mauve text-cream",
    chip: "bg-cream text-maroon",
    accent: "bg-gold text-maroon",
    button: "bg-cream text-maroon hover:bg-white",
    swatch: "bg-mauve ring-1 ring-current/40",
    line: "border-cream/30",
    hex: { bg: "#a55e74", ink: "#fff4e6" },
  },
  butter: {
    card: "bg-butter text-maroon",
    chip: "bg-maroon text-cream",
    accent: "bg-maroon text-gold",
    button: "bg-maroon text-cream hover:bg-plum",
    swatch: "bg-butter ring-1 ring-current/40",
    line: "border-maroon/20",
    hex: { bg: "#fcd98c", ink: "#7a1f3d" },
  },
  plum: {
    card: "bg-plum text-pink",
    chip: "bg-gold text-maroon",
    accent: "bg-gold text-maroon",
    button: "bg-pink text-plum hover:bg-white",
    swatch: "bg-plum ring-1 ring-current/40",
    line: "border-pink/20",
    hex: { bg: "#4f1229", ink: "#ffe3ea" },
  },
  cream: {
    card: "bg-cream text-maroon ring-1 ring-maroon/15",
    chip: "bg-maroon text-cream",
    accent: "bg-gold text-maroon",
    button: "bg-maroon text-cream hover:bg-plum",
    swatch: "bg-cream ring-1 ring-current/40",
    line: "border-maroon/15",
    hex: { bg: "#fff4e6", ink: "#7a1f3d" },
  },
} satisfies Record<string, Tone>;

export const CATEGORIES = [
  { key: "social", label: "Social", tone: TONES.maroon },
  { key: "sports", label: "Sports & fitness", tone: TONES.mauve },
  { key: "arts", label: "Arts & culture", tone: TONES.blush },
  { key: "learn", label: "Learn & career", tone: TONES.gold },
  { key: "give", label: "Give back", tone: TONES.butter },
  { key: "meetings", label: "Club meetings", tone: TONES.plum },
  { key: "other", label: "Other", tone: TONES.cream },
] as const;

export type Category = (typeof CATEGORIES)[number]["key"];

export function isCategory(value: string): value is Category {
  return CATEGORIES.some((c) => c.key === value);
}

export function categoryOf(key: string) {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
}

// Day cards in the week view cycle through the brand colours, Monday first,
// alternating dark and light like the Instagram posts.
const WEEKDAY_TONES = [TONES.maroon, TONES.gold, TONES.blush, TONES.mauve, TONES.butter, TONES.plum, TONES.cream];

/** The tone for a date's day card, by weekday. */
export function dayTone(date: string): Tone {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return WEEKDAY_TONES[(weekday + 6) % 7];
}

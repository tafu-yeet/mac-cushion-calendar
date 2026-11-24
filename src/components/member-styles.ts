// Class names shared by the sign-in, welcome and account pages, matching the feedback sheet.

export const PAGE = "mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-8";
export const TITLE = "font-display text-3xl font-semibold leading-tight lowercase";
export const CARD = "flex flex-col gap-4 rounded-[28px] bg-panel p-5 shadow-sm ring-1 ring-maroon/10";
export const LABEL = "flex flex-col gap-1.5 text-sm font-semibold";
// 16px text, so phones don't zoom in on focus.
export const INPUT =
  "min-h-12 rounded-full bg-white/70 px-4 text-base font-normal ring-1 ring-maroon/20 placeholder:text-maroon/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon";
export const BUTTON =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-maroon px-5 text-base font-semibold text-cream hover:bg-plum disabled:opacity-60";
export const BUTTON_LIGHT =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-base font-semibold text-maroon ring-1 ring-maroon/25 hover:bg-cream disabled:opacity-60";
export const LINK_BUTTON = "inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-2 hover:text-plum disabled:opacity-60";
export const ALERT = "rounded-2xl bg-blush px-4 py-2.5 text-sm font-semibold";
export const NOTE = "rounded-2xl bg-butter/60 px-4 py-2.5 text-sm";
// A checkbox row with a tap area the size of a thumb.
export const CHECK_ROW = "flex cursor-pointer items-start gap-3 rounded-2xl px-1 py-2 text-sm leading-snug";
export const CHECKBOX = "mt-0.5 size-5 shrink-0 accent-maroon";

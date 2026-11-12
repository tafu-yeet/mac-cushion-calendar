import type { PublicEvent } from "@/lib/events";

/** You can't just turn up: registration is required, and not at the door ("tickets sold at the door" is walk-in). */
export const signUpFirst = (event: PublicEvent) => event.registration === "required" && event.registrationWhere !== "at_the_door";

/** Where to sign up for an event: the link that matches how the club said to register, or null when there isn't one. */
export function registrationLink(event: PublicEvent): string | null {
  switch (event.registrationWhere) {
    case "rubric":
      return event.registrationUrl ?? event.rubricUrl;
    case "link_in_bio":
      // The specific link from the club's bio or Linktree when we found it (worker/bio_links.py), else the profile.
      return event.registrationUrl ?? (event.clubUsername ? `https://www.instagram.com/${event.clubUsername}/` : null);
    case "at_the_door":
      return null;
    case "qr_code":
      return event.permalink;
    default:
      return event.registrationUrl ?? event.permalink;
  }
}

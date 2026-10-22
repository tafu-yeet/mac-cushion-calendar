import { campus } from "@/lib/campus";

// What people agree to when they join: shown by the form and saved with each
// sign-up, since Canada's anti-spam law asks senders to keep a record of consent.
export const LAUNCH_CONSENT = `Email me when ${campus.siteName} launches. I can unsubscribe anytime.`;
export const NEWSLETTER_CONSENT = "Also send me the newsletter: free food and the best events coming up.";

export function consentText(newsletter: boolean): string {
  return newsletter ? `${LAUNCH_CONSENT} ${NEWSLETTER_CONSENT}` : LAUNCH_CONSENT;
}

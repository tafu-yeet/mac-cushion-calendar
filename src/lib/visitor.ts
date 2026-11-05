// Supabase's session cookie: only admins sign in, so a visitor with one is an admin.
const SIGNED_IN = /(?:^|;\s*)sb-[^=]+-auth-token(?:\.\d+)?=/;

/** Whether this browser's visits count in the site's stats: not an admin's, or an automated browser's. Browser only. */
export const countsAsVisitor = () => !navigator.webdriver && !SIGNED_IN.test(document.cookie);

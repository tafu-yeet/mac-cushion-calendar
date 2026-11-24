// Unsubscribe links and headers for member emails. Every email carries a link in its footer
// and List-Unsubscribe headers (RFC 2369 and RFC 8058's one-click POST, which Gmail and Yahoo
// require). Both name the member by their profile's email_token, so no sign-in is needed.

export type EmailChoice = "digest" | "club_posts" | "reminders";
export type UnsubscribeChoice = EmailChoice | "all";

const CHOICES: readonly UnsubscribeChoice[] = ["digest", "club_posts", "reminders", "all"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What each choice is called in an email or on the unsubscribe page. */
export const CHOICE_NAMES: Record<UnsubscribeChoice, string> = {
  digest: "the Sunday picks email",
  club_posts: "emails when clubs you follow post",
  reminders: "event reminders",
  all: "all emails from us",
};

/** The footer link: a page that unsubscribes with one tap. */
export function unsubscribeUrl(siteUrl: string, token: string, choice: UnsubscribeChoice): string {
  const url = new URL("/unsubscribe", siteUrl);
  url.searchParams.set("t", token);
  url.searchParams.set("c", choice);
  return url.toString();
}

/** Where mail apps POST "List-Unsubscribe=One-Click". */
export function oneClickUrl(siteUrl: string, token: string, choice: UnsubscribeChoice): string {
  const url = new URL("/unsubscribe/one-click", siteUrl);
  url.searchParams.set("t", token);
  url.searchParams.set("c", choice);
  return url.toString();
}

/** The headers every member email carries. */
export function listUnsubscribeHeaders(siteUrl: string, token: string, choice: UnsubscribeChoice): Record<string, string> {
  return {
    "List-Unsubscribe": `<${oneClickUrl(siteUrl, token, choice)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** The token and choice from an unsubscribe link, or null if either is missing or malformed. */
export function parseUnsubscribe(params: URLSearchParams | Record<string, string | string[] | undefined>): { token: string; choice: UnsubscribeChoice } | null {
  const get = (key: string) => {
    const value = params instanceof URLSearchParams ? params.get(key) : params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  };
  const token = get("t");
  const choice = (get("c") || "all") as UnsubscribeChoice;
  if (!UUID.test(token) || !CHOICES.includes(choice)) return null;
  return { token: token.toLowerCase(), choice };
}

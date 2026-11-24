import "server-only";

import { headers } from "next/headers";

/**
 * This request's own origin ("https://www.maccushion.ca", a Vercel preview, or localhost), for
 * the links in sign-in emails and the trip back from Google. Supabase only redirects to
 * addresses on its allow list, so a forged Host header can't send anyone elsewhere.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

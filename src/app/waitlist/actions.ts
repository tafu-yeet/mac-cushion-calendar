"use server";

import { createPublicClient } from "@/lib/supabase/public";

import { consentText } from "./consent";

export type JoinState =
  | { status: "joined" | "already"; email: string; newsletter: boolean }
  | { status: "error"; message: string; email: string; newsletter: boolean } // what they typed, to put back in the form
  | null;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The link someone came from (?from=story), kept to letters, digits and dashes. */
function cleanSource(value: FormDataEntryValue | null): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 30);
}

export async function joinWaitlist(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const newsletter = formData.get("newsletter") === "on";

  // Bots fill in every field, including this one people never see: pretend it worked.
  if (formData.get("website")) return { status: "joined", email, newsletter };

  if (!EMAIL.test(email) || email.length > 254) {
    return { status: "error", message: "That doesn't look like an email address. Check it and try again.", email, newsletter };
  }

  const { data: added, error } = await createPublicClient().rpc("join_waitlist", {
    p_email: email,
    p_newsletter: newsletter,
    p_source: cleanSource(formData.get("from")),
    p_consent: consentText(newsletter),
  });
  if (error) {
    console.error(`Couldn't add to the waitlist: ${error.message}`);
    return { status: "error", message: "Something went wrong on our end. Try again in a minute.", email, newsletter };
  }
  return { status: added ? "joined" : "already", email, newsletter };
}

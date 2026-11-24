"use client";

import Link from "next/link";
import { useActionState } from "react";

import { ALERT, BUTTON, BUTTON_LIGHT, LINK_BUTTON, NOTE } from "@/components/member-styles";
import { CHOICE_NAMES, type UnsubscribeChoice } from "@/lib/email/unsubscribe";

import { unsubscribeFromPage } from "./actions";

export function UnsubscribeForm({ token, choice }: { token: string; choice: UnsubscribeChoice }) {
  const [state, action, pending] = useActionState(unsubscribeFromPage, null);

  if (state?.result === "done") {
    return (
      <form action={action} className="flex flex-col gap-4">
        <p className={NOTE}>Done: you won&apos;t get {CHOICE_NAMES[state.choice]} any more.</p>
        {state.choice !== "all" && (
          <>
            <input type="hidden" name="t" value={token} />
            <input type="hidden" name="c" value="all" />
            <button type="submit" disabled={pending} className={BUTTON_LIGHT}>
              Unsubscribe from all emails too
            </button>
          </>
        )}
        <Link href="/account" className={LINK_BUTTON}>
          Change emails on your account page
        </Link>
      </form>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="t" value={token} />
      <input type="hidden" name="c" value={choice} />
      <p className="text-base leading-relaxed">Stop getting {CHOICE_NAMES[choice]}?</p>
      {state?.result === "unknown" && <p className={ALERT}>We couldn&apos;t find whose link this is. It may be from a deleted account.</p>}
      {state?.result === "error" && <p className={ALERT}>That didn&apos;t work. Try again in a minute.</p>}
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Unsubscribing…" : "Unsubscribe"}
      </button>
    </form>
  );
}

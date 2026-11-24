"use client";

import Link from "next/link";
import { useActionState } from "react";

import { ALERT, BUTTON, INPUT, LABEL, LINK_BUTTON, NOTE } from "@/components/member-styles";
import { campus } from "@/lib/campus";

import { setPassword } from "../actions";

export function PasswordForm({ email, reset }: { email: string | null; reset: boolean }) {
  const [state, action, pending] = useActionState(setPassword, null);
  if (state?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <p className={NOTE}>Saved. Next time, sign in with your email and this password, or keep using codes.</p>
        <Link href="/account" className={BUTTON}>
          Back to your account
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-base leading-relaxed">
        {reset ? "Pick a new password." : `Optional: ${campus.signIn.google ? "codes and Google work" : "codes work"} without one.`} It&apos;s for {email ?? "your account"}.
      </p>
      {/* For password managers: which account this password belongs to. */}
      <input type="email" name="username" value={email ?? ""} autoComplete="username" readOnly hidden />
      <label className={LABEL}>
        New password
        <input name="password" type="password" autoComplete="new-password" minLength={8} required className={INPUT} />
      </label>
      <p className="text-xs text-maroon/75">At least 8 characters.</p>
      {state && !state.ok && (
        <p role="alert" className={ALERT}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Saving…" : "Save password"}
      </button>
      <Link href="/account" className={LINK_BUTTON}>
        Cancel
      </Link>
    </form>
  );
}

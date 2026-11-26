"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { ALERT, BUTTON, BUTTON_LIGHT, CHECK_ROW, CHECKBOX, INPUT, LABEL, LINK_BUTTON, NOTE } from "@/components/member-styles";
import { DrawnCheck, PulseRing } from "@/components/motion";
import { DIGEST_CONSENT_WORDING } from "@/lib/auth-links";

import { signInStep } from "./actions";

type Props = { next: string; google: boolean; inAppBrowser: boolean; error?: string };

/** The sign-in form, restarted from scratch by "Use a different email". */
export function SignInForm(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return <SignInSteps key={attempt} {...props} error={attempt === 0 ? props.error : undefined} onRestart={() => setAttempt((a) => a + 1)} />;
}

function SignInSteps({ next, google, inAppBrowser, error, onRestart }: Props & { onRestart: () => void }) {
  const [state, action, pending] = useActionState(signInStep, null);
  const [usePassword, setUsePassword] = useState(false);
  const message = state?.error ?? (state ? undefined : error);

  if (state?.step === "code") {
    return (
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="email" value={state.email} />
        <input type="hidden" name="next" value={next} />
        {/* Where "Email me a code" was: it's now "Code sent ✓", the check drawing itself (again for each new code). */}
        <p
          key={state.notice ?? "sent"}
          aria-hidden="true"
          className="relative inline-flex w-fit items-center gap-1.5 rounded-full bg-maroon px-4 py-2 text-sm font-semibold text-cream animate-[motion-blur-in_var(--motion-base)_var(--ease-out)_both]"
        >
          <DrawnCheck drawn={1} />
          Code sent
          <PulseRing beat={1} />
        </p>
        <p className="text-base leading-relaxed">
          {state.notice ?? "We emailed you a 6-digit code."} It went to <span className="font-semibold">{state.email}</span>.
        </p>
        <label className={LABEL}>
          Code
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            required
            autoFocus
            placeholder="123456"
            className={`${INPUT} text-center text-xl tracking-[0.3em]`}
          />
        </label>
        {state.error && (
          <p role="alert" className={ALERT}>
            {state.error}
          </p>
        )}
        <button type="submit" name="intent" value="verify-code" disabled={pending} className={BUTTON}>
          {pending ? "Checking…" : state.purpose === "recovery" ? "Continue" : "Sign in"}
        </button>
        <p className="text-sm text-maroon/80">
          Or tap the link in the email: it signs you in wherever it opens. Not there? Check your junk folder.
        </p>
        <div className="flex flex-wrap gap-x-5">
          <button type="submit" name="intent" value="resend" formNoValidate disabled={pending} className={LINK_BUTTON}>
            Send a new code
          </button>
          <button type="button" onClick={onRestart} className={LINK_BUTTON}>
            Use a different email
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      {!google ? null : inAppBrowser ? (
        <p className={NOTE}>
          Google sign-in doesn&apos;t work inside Instagram&apos;s browser, so use your email below. Or open this page
          in Safari or Chrome (tap <span className="font-semibold">···</span> then{" "}
          <span className="font-semibold">Open in browser</span>) to use Google.
        </p>
      ) : (
        <>
          <button type="submit" name="intent" value="google" formNoValidate disabled={pending} className={BUTTON_LIGHT}>
            <GoogleMark />
            Continue with Google
          </button>
          <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-maroon/70" aria-hidden="true">
            <span className="h-px flex-1 bg-maroon/20" />
            or
            <span className="h-px flex-1 bg-maroon/20" />
          </p>
        </>
      )}

      <label className={LABEL}>
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state?.email}
          placeholder="you@mcmaster.ca"
          className={INPUT}
        />
      </label>

      {usePassword && (
        <label className={LABEL}>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={8}
            className={INPUT}
          />
        </label>
      )}

      <label className={CHECK_ROW}>
        <input type="checkbox" name="digest" className={CHECKBOX} />
        <span>{DIGEST_CONSENT_WORDING}</span>
      </label>

      {message && (
        <p role="alert" className={ALERT}>
          {message}
        </p>
      )}

      {usePassword ? (
        <>
          <button type="submit" name="intent" value="password" disabled={pending} className={BUTTON}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
          <div className="flex flex-wrap gap-x-5">
            <button type="submit" name="intent" value="sign-up" disabled={pending} className={LINK_BUTTON}>
              New here? Make an account with this password
            </button>
            <button type="submit" name="intent" value="reset" formNoValidate disabled={pending} className={LINK_BUTTON}>
              Forgot your password?
            </button>
            <button type="button" onClick={() => setUsePassword(false)} className={LINK_BUTTON}>
              Email me a code instead
            </button>
          </div>
        </>
      ) : (
        <>
          <button type="submit" name="intent" value="send-code" disabled={pending} className={BUTTON}>
            {pending ? "Sending…" : "Email me a code"}
          </button>
          <p className="text-sm text-maroon/80">
            New or returning, it&apos;s the same: we email a code, no password needed.{" "}
            <button type="button" onClick={() => setUsePassword(true)} className="font-semibold underline underline-offset-2">
              Use a password instead
            </button>
          </p>
        </>
      )}

      <p className="text-xs leading-relaxed text-maroon/75">
        The calendar stays open to everyone. An account adds event details, clubs, reminders and your schedule.{" "}
        <Link href="/privacy" className="font-semibold underline underline-offset-2">
          What we keep
        </Link>
      </p>
    </form>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

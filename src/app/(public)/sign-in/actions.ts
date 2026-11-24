"use server";

import type { AuthError } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { NEXT_COOKIE, PENDING_MAX_AGE_S, SIGNUP_DIGEST_COOKIE, safeNext } from "@/lib/auth-links";
import { finishSignIn } from "@/lib/finish-sign-in";
import { requestOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

/** Where the sign-in form is: the first screen, or waiting for the emailed code. */
export type SignInState = {
  step: "start" | "code";
  email?: string;
  /** What the code is for: signing in (or confirming a new account), or setting a new password. */
  purpose?: "sign-in" | "recovery";
  error?: string;
  notice?: string;
} | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

function friendly(error: AuthError, fallback: string): string {
  switch (error.code) {
    case "over_email_send_rate_limit":
      return "We just sent one. Wait a minute, then ask again.";
    case "over_request_rate_limit":
      return "Too many tries. Wait a few minutes, then try again.";
    case "email_address_invalid":
      return "That email address doesn't look right.";
    case "weak_password":
      return `Pick a longer password: at least ${MIN_PASSWORD} characters, and not a common one.`;
    case "email_not_confirmed":
      return "Confirm your email first: use the code we sent, or get a new one below.";
    default:
      console.error(`Sign-in: ${error.code ?? error.name}: ${error.message}`);
      return fallback;
  }
}

/**
 * Every button on the sign-in form, told apart by the `intent` its button sends: Google, an
 * emailed code (new or returning, same thing), a password, a new account with a password, or a
 * forgotten password. Each one either moves the form on a step or leaves the site signed in and
 * goes where finishSignIn says, having applied whatever was picked on the way.
 */
export async function signInStep(prev: SignInState, formData: FormData): Promise<SignInState> {
  const intent = String(formData.get("intent") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  // The Sunday picks box and where to go next, kept for the trip to Google or the inbox.
  const jar = await cookies();
  const origin = await requestOrigin();
  const keep = { httpOnly: true, sameSite: "lax" as const, secure: origin.startsWith("https:"), maxAge: PENDING_MAX_AGE_S, path: "/" };
  if (intent !== "verify-code" && intent !== "resend") {
    if (formData.get("digest") === "on") jar.set(SIGNUP_DIGEST_COOKIE, "1", keep);
    else jar.delete(SIGNUP_DIGEST_COOKIE);
    jar.set(NEXT_COOKIE, next, keep);
  }

  const supabase = await createClient();
  const start = (error: string): SignInState => ({ step: "start", email, error });

  if (intent === "google") {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback` },
    });
    if (error || !data.url) return start("Google sign-in isn't working right now. Use your email instead.");
    redirect(data.url);
  }

  if (!EMAIL.test(email)) return start("Enter your email address.");

  switch (intent) {
    case "send-code": {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) return start(friendly(error, "We couldn't send the code. Try again in a minute."));
      return { step: "code", email, purpose: "sign-in" };
    }

    case "resend": {
      const recovery = prev?.purpose === "recovery";
      const { error } = recovery
        ? await supabase.auth.resetPasswordForEmail(email)
        : await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      const base = { step: "code" as const, email, purpose: prev?.purpose ?? "sign-in" };
      if (error) return { ...base, error: friendly(error, "We couldn't send a new code. Try again in a minute.") };
      return { ...base, notice: "Sent. Use the newest code: the old one stops working." };
    }

    case "verify-code": {
      const token = String(formData.get("code") ?? "").replace(/\D/g, "");
      const recovery = prev?.purpose === "recovery";
      const base = { step: "code" as const, email, purpose: prev?.purpose ?? "sign-in" };
      if (token.length !== 6) return { ...base, error: "The code is 6 digits." };
      const { error } = await supabase.auth.verifyOtp({ email, token, type: recovery ? "recovery" : "email" });
      if (error) return { ...base, error: "That code didn't work. It may have expired: send a new one." };
      redirect(recovery ? "/account/password?reset=1" : await finishSignIn());
    }

    case "password": {
      if (!password) return start("Enter your password.");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.code === "email_not_confirmed") return start(friendly(error, ""));
        return start("That email and password didn't match. No password yet? Get a code instead.");
      }
      redirect(await finishSignIn());
    }

    case "sign-up": {
      if (password.length < MIN_PASSWORD) return start(`Pick a password of at least ${MIN_PASSWORD} characters.`);
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return start(friendly(error, "We couldn't make the account. Try again in a minute."));
      // Supabase answers this way, sending nothing, when the address already has an account.
      if (data.user && data.user.identities?.length === 0) {
        return start("That email already has an account. Sign in with its password, or get a code instead.");
      }
      if (data.session) redirect(await finishSignIn());
      return { step: "code", email, purpose: "sign-in", notice: "To confirm it's you, we emailed you a code." };
    }

    case "reset": {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) return start(friendly(error, "We couldn't send the email. Try again in a minute."));
      return { step: "code", email, purpose: "recovery", notice: "We emailed you a code to set a new password." };
    }

    default:
      return start("Something went wrong. Try again.");
  }
}

/** Finishes signing in from the link in the email (the code's twin), after a tap on "Finish signing in". */
export async function confirmFromLink(formData: FormData): Promise<void> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = formData.get("type") === "recovery" ? "recovery" : "email";
  if (!tokenHash) redirect("/sign-in?error=expired");
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) redirect("/sign-in?error=expired");
  redirect(type === "recovery" ? "/account/password?reset=1" : await finishSignIn());
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

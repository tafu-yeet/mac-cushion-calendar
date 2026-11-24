import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";

import { BUTTON, BUTTON_LIGHT, CARD, PAGE, TITLE } from "@/components/member-styles";
import { IN_APP_BROWSER, safeNext } from "@/lib/auth-links";
import { campus } from "@/lib/campus";
import { getClub } from "@/lib/clubs";
import { getEvent } from "@/lib/events";
import { currentUser, hasSessionCookie } from "@/lib/member";

import { signOut } from "./actions";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: `Follow clubs, get Sunday picks and see what fits your schedule on ${campus.siteName}.`,
  alternates: { canonical: "/sign-in" },
  robots: { index: false },
};

const ERRORS: Record<string, string> = {
  google: "Google sign-in didn't finish. Try again, or use your email.",
  expired: "That sign-in link has expired or was already used. Get a new code below.",
};

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <div className={PAGE}>
      <div>
        <h1 className={TITLE}>sign in or join</h1>
        <p className="mt-2 text-base leading-relaxed">
          Follow your clubs, get Sunday picks for the week, and see only what fits around your classes.
        </p>
      </div>
      <div className={CARD}>
        <Suspense fallback={<div className="h-80" />}>
          <SignInFromRequest searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function SignInFromRequest({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const [params, h] = await Promise.all([searchParams, headers()]);
  const next = safeNext(first(params.next));
  const error = first(params.error);

  // Already signed in: say so, rather than bounce, so a page that sent them here can't loop.
  const user = (await hasSessionCookie()) ? await currentUser() : null;
  if (user) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-base leading-relaxed">
          {error === "not-admin" ? (
            <>
              You&apos;re signed in as <span className="font-semibold">{user.email}</span>, which isn&apos;t an admin
              account.
            </>
          ) : (
            <>
              You&apos;re signed in as <span className="font-semibold">{user.email}</span>.
            </>
          )}
        </p>
        {error !== "not-admin" && (
          <Link href={next} className={BUTTON}>
            Continue
          </Link>
        )}
        <form action={signOut}>
          <button type="submit" className={`${BUTTON_LIGHT} w-full`}>
            Sign out
          </button>
        </form>
      </div>
    );
  }

  const goingTo = await pageName(next);
  return (
    <>
      {goingTo && (
        <p className="text-base leading-relaxed">
          Sign in or join to see <span className="font-semibold">{goingTo}</span>. It&apos;s free.
        </p>
      )}
      <SignInForm
        next={next}
        google={campus.signIn.google}
        inAppBrowser={IN_APP_BROWSER.test(h.get("user-agent") ?? "")}
        error={error ? ERRORS[error] : undefined}
      />
    </>
  );
}

/** The event or club a members-only link was headed to, by name, or null. */
async function pageName(next: string): Promise<string | null> {
  const event = next.match(/^\/events\/(\d+)(?:[/?#]|$)/);
  if (event) return (await getEvent(Number(event[1])))?.name ?? null;
  const club = next.match(/^\/clubs\/([^/?#]+)/);
  if (club) return (await getClub(decodeURIComponent(club[1])))?.name ?? null;
  return null;
}

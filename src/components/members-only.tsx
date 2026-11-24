import "server-only";

import { headers } from "next/headers";

import { SignInForm } from "@/app/(public)/sign-in/sign-in-form";
import { IN_APP_BROWSER } from "@/lib/auth-links";
import { campus } from "@/lib/campus";

import { CARD } from "./member-styles";

/**
 * What a signed-out visitor sees on a members-only page: what it is, why to join, and the
 * sign-in form, which brings them back to `next`. Only the calendar itself (home, Day and
 * Week) is open to everyone. The page's title and link preview stay public, so a shared link
 * still says what it's about. `level` 2 is for pages whose own title stays above it.
 */
export async function MembersOnly({ next, heading, detail, level = 1 }: { next: string; heading: string; detail?: React.ReactNode; level?: 1 | 2 }) {
  const userAgent = (await headers()).get("user-agent") ?? "";
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <div>
        <p className="text-sm font-semibold text-maroon/75">Free with an account</p>
        <Heading className="mt-1 font-display text-3xl font-semibold leading-tight">{heading}</Heading>
        {detail && <p className="mt-1 text-base font-medium">{detail}</p>}
        <p className="mt-3 text-base leading-relaxed">
          Sign in or join to see event details, add them to your calendar and follow clubs. No password needed: we email
          you a 6-digit code.
        </p>
      </div>
      <div className={CARD}>
        <SignInForm next={next} google={campus.signIn.google} inAppBrowser={IN_APP_BROWSER.test(userAgent)} />
      </div>
    </div>
  );
}

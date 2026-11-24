import type { Metadata } from "next";
import Link from "next/link";

import { CARD, PAGE, TITLE } from "@/components/member-styles";
import { campus } from "@/lib/campus";

export const metadata: Metadata = {
  title: "Privacy",
  description: `What ${campus.siteName} keeps about you, and what it doesn't.`,
  alternates: { canonical: "/privacy" },
};

const H2 = "font-display text-xl font-semibold lowercase";
const P = "text-sm leading-relaxed";

export default function PrivacyPage() {
  return (
    <div className={`${PAGE} max-w-2xl`}>
      <div>
        <h1 className={TITLE}>what we keep</h1>
        <p className="mt-2 text-base leading-relaxed">
          {campus.siteName} is a student project. Browsing needs no account, and we keep as little as we can.
        </p>
      </div>

      <section className={CARD}>
        <h2 className={H2}>if you just browse</h2>
        <p className={P}>
          Your browser makes up a random id the first time you visit, so we can count visitors and who comes back. With it we
          keep the day, the page you landed on, and where you came from (Instagram, Google, a link or none), plus which events
          were seen and tapped. Nothing that says who you are.
        </p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>if you make an account</h2>
        <ul className={`${P} list-disc pl-5`}>
          <li>Your email address, and your name if you give one or sign in with Google.</li>
          <li>The clubs you follow, what you said you&apos;re into, and the events you asked to be reminded about.</li>
          <li>
            Your class schedule as weekly busy times only (day, start and end) until your term ends. Not course names, rooms or
            the calendar file: that&apos;s read on your phone and never sent to us.
          </li>
          <li>
            Which emails you agreed to, when, and the words you agreed to (Canada&apos;s anti-spam law asks us to keep this), and
            each email we sent you.
          </li>
          <li>The days you used the site while signed in, for counting active members. Not what you did.</li>
        </ul>
        <p className={P}>
          Signed in, we stop counting you as an anonymous visitor. Nobody else can see your follows, interests or schedule; the
          site&apos;s admins see totals only.
        </p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>emails</h2>
        <p className={P}>
          We only email you what you ticked, from {campus.email.from.replace(/\s*<.*>/, "")}. Every email has a one-tap
          unsubscribe link, and your account page turns each one on or off.
        </p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>who handles it</h2>
        <p className={P}>
          Accounts and data live in Supabase; the site runs on Vercel; emails go out through Resend; Google handles &ldquo;Continue
          with Google&rdquo; if you use it. We don&apos;t sell or share your data with anyone else, and there are no ads.
        </p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>deleting it</h2>
        <p className={P}>
          <Link href="/account" className="font-semibold underline underline-offset-2">
            Your account page
          </Link>{" "}
          has &ldquo;Delete my account&rdquo;: it deletes the account and everything above that&apos;s tied to it, right away.
          Questions? Email{" "}
          <a href={`mailto:${campus.email.contact}`} className="font-semibold underline underline-offset-2">
            {campus.email.contact}
          </a>
          .
        </p>
      </section>
    </div>
  );
}

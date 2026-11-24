import type { Metadata } from "next";
import { Suspense } from "react";

import { PAGE } from "@/components/member-styles";
import { safeNext } from "@/lib/auth-links";
import { requireMember } from "@/lib/auth";

import { WelcomeSurvey } from "./welcome-survey";

export const metadata: Metadata = { title: "Welcome", robots: { index: false } };

// The first stop after signing up: what you're into (it orders your feed) and which emails you
// want. Both are optional, and "Skip" means it never shows again.
export default function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  return (
    <div className={PAGE}>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[28px] bg-maroon/10" />}>
        <Welcome searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Welcome({ searchParams }: { searchParams: PageProps<"/welcome">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : undefined);
  const member = await requireMember(`/welcome?next=${encodeURIComponent(next)}`);
  return (
    <WelcomeSurvey
      next={next}
      name={member.name}
      memberNumber={member.memberNumber}
      founding={member.founding}
      interests={member.interests}
      emails={member.emails}
    />
  );
}

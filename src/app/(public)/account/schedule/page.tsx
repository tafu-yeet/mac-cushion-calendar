import type { Metadata } from "next";
import { Suspense } from "react";

import { PAGE, TITLE } from "@/components/member-styles";
import { requireMember } from "@/lib/auth";
import { currentTerm } from "@/lib/schedule";
import { addDays, todayInCampus } from "@/lib/time";

import { ScheduleEditor } from "./schedule-editor";

export const metadata: Metadata = { title: "Your class schedule", robots: { index: false } };

export default function SchedulePage() {
  return (
    <div className={`${PAGE} max-w-2xl`}>
      <div>
        <h1 className={TITLE}>your class schedule</h1>
        <p className="mt-2 text-base leading-relaxed">
          Then &ldquo;Fits my schedule&rdquo; hides events that clash with your classes, with 15 minutes to get there.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 skeleton rounded-[28px]" />}>
        <Editor />
      </Suspense>
    </div>
  );
}

async function Editor() {
  const member = await requireMember("/account/schedule");
  const today = todayInCampus();
  const term = currentTerm(today);
  return <ScheduleEditor saved={member.busy} today={today} termEnd={term?.classesEnd ?? addDays(today, 120)} termName={term?.name ?? null} />;
}

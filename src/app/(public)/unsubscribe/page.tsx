import type { Metadata } from "next";
import { Suspense } from "react";

import { ALERT, CARD, PAGE, TITLE } from "@/components/member-styles";
import { parseUnsubscribe } from "@/lib/email/unsubscribe";

import { UnsubscribeForm } from "./unsubscribe-form";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

// The link in every email's footer. Unsubscribing takes one tap here rather than happening when
// the page opens, because email scanners (Outlook's especially) open links on their own.
export default function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  return (
    <div className={PAGE}>
      <h1 className={TITLE}>unsubscribe</h1>
      <div className={CARD}>
        <Suspense fallback={<div className="h-32" />}>
          <FromLink searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function FromLink({ searchParams }: { searchParams: PageProps<"/unsubscribe">["searchParams"] }) {
  const link = parseUnsubscribe(await searchParams);
  if (!link) {
    return (
      <p className={ALERT}>
        That unsubscribe link is incomplete. Use the link in the email again, or turn emails off on your account page.
      </p>
    );
  }
  return <UnsubscribeForm token={link.token} choice={link.choice} />;
}

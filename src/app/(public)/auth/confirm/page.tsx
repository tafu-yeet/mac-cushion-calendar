import type { Metadata } from "next";
import { Suspense } from "react";

import { BUTTON, CARD, PAGE, TITLE } from "@/components/member-styles";

import { confirmFromLink } from "../../sign-in/actions";

export const metadata: Metadata = { title: "Finish signing in", robots: { index: false } };

// The link in the sign-in email lands here. Signing in waits for a tap, because some email
// services (Outlook's, at many schools) open every link to scan it, which would use it up.
export default function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  return (
    <div className={PAGE}>
      <h1 className={TITLE}>almost there</h1>
      <div className={CARD}>
        <Suspense fallback={<div className="h-24" />}>
          <ConfirmButton searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function ConfirmButton({ searchParams }: { searchParams: PageProps<"/auth/confirm">["searchParams"] }) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const type = params.type === "recovery" ? "recovery" : "email";
  return (
    <form action={confirmFromLink} className="flex flex-col gap-4">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <p className="text-base leading-relaxed">
        {type === "recovery" ? "Tap below to set a new password." : "Tap below to finish signing in on this device."}
      </p>
      <button type="submit" className={BUTTON}>
        {type === "recovery" ? "Set a new password" : "Finish signing in"}
      </button>
    </form>
  );
}

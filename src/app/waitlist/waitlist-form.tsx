"use client";

import { useActionState } from "react";

import { ShareButton } from "@/components/share-button";
import { campus } from "@/lib/campus";

import { joinWaitlist, type JoinState } from "./actions";
import { NEWSLETTER_CONSENT } from "./consent";

/** The email box, the newsletter tick box, and the thank-you once someone joins. */
export function WaitlistForm() {
  const [state, action, pending] = useActionState(joinWaitlist, null);

  if (state && state.status !== "error") return <Joined state={state} />;

  return (
    <form
      // Which link they came from (?from=story), read when they submit.
      action={(formData) => {
        formData.set("from", new URLSearchParams(window.location.search).get("from") ?? "");
        action(formData);
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-2">
        <span className="font-display text-lg font-semibold lowercase">get on the list</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state?.email}
          placeholder="you@example.com"
          aria-describedby={state?.status === "error" ? "waitlist-error" : undefined}
          className="w-full rounded-full bg-cream px-5 py-3 text-base text-maroon placeholder:text-maroon/50 focus:outline-none focus-visible:ring-4 focus-visible:ring-gold"
        />
      </label>

      {/* People never see this; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px]">
        <input name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug">
        <input name="newsletter" type="checkbox" defaultChecked={state?.newsletter} className="mt-0.5 size-5 shrink-0 accent-gold" />
        <span>{NEWSLETTER_CONSENT}</span>
      </label>

      {state?.status === "error" && (
        <p id="waitlist-error" role="alert" className="rounded-2xl bg-cream px-4 py-2.5 text-sm font-semibold text-maroon">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-gold px-5 py-3 font-display text-lg font-semibold text-maroon lowercase transition-colors hover:bg-butter disabled:opacity-70"
      >
        {pending ? "joining…" : "join the waitlist"}
      </button>

      <p className="text-xs leading-relaxed text-cream/80">
        We&apos;ll email you when {campus.siteName} launches, and send the newsletter only if you tick the box.
        Unsubscribe anytime.
      </p>
    </form>
  );
}

function Joined({ state }: { state: Exclude<JoinState, { status: "error" } | null> }) {
  return (
    <div role="status" className="flex flex-col items-start gap-3">
      <p className="font-display text-4xl font-semibold leading-none lowercase">
        {state.status === "joined" ? "you're on the list!" : "you're already in!"}
      </p>
      <p className="text-cream/90">
        {state.status === "joined" ? "We'll email " : "You were already on the list. We'll email "}
        <span className="font-semibold break-all">{state.email}</span> the day {campus.siteName} launches.
        {state.newsletter && " You'll get the newsletter too."}
      </p>
      <p className="mt-2 text-sm text-cream/90">Know someone who never says no to free food?</p>
      <ShareButton
        title={campus.siteName}
        text={`Every ${campus.schoolShortName} event in one place, free food included. Join the waitlist:`}
        path="/waitlist?from=friend"
        label="Send them the link"
      />
    </div>
  );
}

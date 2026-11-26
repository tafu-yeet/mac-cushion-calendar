"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { BUTTON, CARD, CHECK_ROW, CHECKBOX, LINK_BUTTON, TITLE } from "@/components/member-styles";
import { WipeFill } from "@/components/motion";
import { CLUB_POSTS_CONSENT_WORDING, DIGEST_CONSENT_WORDING, REMINDERS_CONSENT_WORDING } from "@/lib/auth-links";
import { INTERESTS, type EmailChoices, type Interest } from "@/lib/member-types";

import { finishWelcome } from "../account/actions";

type Props = {
  next: string;
  name: string | null;
  memberNumber: number | null;
  founding: boolean;
  interests: Interest[];
  emails: EmailChoices;
};

/** Two quick steps, one form: interests, then emails. Nothing is saved until the end (or Skip). */
export function WelcomeSurvey({ next, name, memberNumber, founding, interests, emails }: Props) {
  const [step, setStepState] = useState<1 | 2>(1);
  // Each step starts at its heading, not wherever the last one was scrolled to.
  const setStep = (s: 1 | 2) => {
    setStepState(s);
    window.scrollTo({ top: 0 });
  };
  const [picked, setPicked] = useState<Set<Interest>>(new Set(interests));
  const toggle = (key: Interest) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <form action={finishWelcome} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      {[...picked].map((key) => (
        <input key={key} type="hidden" name="interest" value={key} />
      ))}

      <div>
        <p className="text-sm font-semibold text-maroon/80">Step {step} of 2</p>
        {/* A thin bar that fills from half to whole on the way to step 2. */}
        <div aria-hidden="true" className="mt-2 h-1 overflow-hidden rounded-full bg-maroon/15">
          <div
            className={`h-full origin-left rounded-full bg-maroon transition-[scale] duration-(--motion-slow) ease-in-out motion-reduce:transition-none ${step === 1 ? "scale-x-50" : "scale-x-100"}`}
          />
        </div>
        <h1 className={TITLE}>{step === 1 ? `welcome${name ? `, ${name.split(" ")[0].toLowerCase()}` : ""}!` : "want emails?"}</h1>
        {step === 1 && memberNumber !== null && (
          <p className="mt-2 inline-flex rounded-full bg-gold px-3 py-1 text-sm font-semibold">
            {founding ? `Founding member #${memberNumber}` : `Member #${memberNumber}`}
          </p>
        )}
      </div>

      {step === 1 ? (
        <div className={CARD}>
          <p className="text-base leading-relaxed">What are you into? We&apos;ll put those first in your feed. Pick as many as you like.</p>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((i) => {
              const on = picked.has(i.key);
              return (
                <button
                  key={i.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(i.key)}
                  className={`press relative min-h-11 rounded-full px-4 text-base font-semibold ring-1 ${
                    i.key === "free_food" ? "bg-gold/30" : "bg-white/70"
                  } ${on ? "ring-maroon" : i.key === "free_food" ? "ring-gold" : "ring-maroon/25"}`}
                >
                  {i.label}
                  {/* Picked, the colour wipes in from the left. */}
                  <WipeFill on={on} className="flex items-center justify-center rounded-full bg-maroon px-4 text-cream">
                    {i.label}
                  </WipeFill>
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => setStep(2)} className={BUTTON}>
            Next
          </button>
        </div>
      ) : (
        <div className={CARD}>
          <p className="text-base leading-relaxed">All off unless you tick them. You can change these anytime in your account.</p>
          <EmailBox name="email_digest" on={emails.digest} wording={DIGEST_CONSENT_WORDING} />
          <EmailBox name="email_club_posts" on={emails.clubPosts} wording={CLUB_POSTS_CONSENT_WORDING} />
          <EmailBox name="email_reminders" on={emails.reminders} wording={REMINDERS_CONSENT_WORDING} />
          <Submit />
          <button type="button" onClick={() => setStep(1)} className={LINK_BUTTON}>
            Back
          </button>
        </div>
      )}

      {/* On step 2, "Done" with nothing ticked is the skip: it keeps the interests just picked. */}
      {step === 1 && (
        <button type="submit" name="intent" value="skip" formNoValidate className={`${LINK_BUTTON} self-center`}>
          Skip for now
        </button>
      )}
    </form>
  );
}

/** A consent box: unticked unless that email is already on (it was ticked when signing up). */
function EmailBox({ name, on, wording }: { name: string; on: boolean; wording: string }) {
  return (
    <label className={CHECK_ROW}>
      <input type="checkbox" name={name} defaultChecked={on} disabled={on} className={CHECKBOX} />
      <span>
        {wording}
        {on && <span className="ml-1 font-semibold">(on)</span>}
      </span>
    </label>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name="intent" value="done" disabled={pending} className={BUTTON}>
      {pending ? "Saving…" : "Done"}
    </button>
  );
}

"use client";

import { useState, useTransition } from "react";

import { BUTTON_LIGHT, INPUT, LABEL } from "@/components/member-styles";
import { updateMember } from "@/components/member-provider";
import { CLUB_POSTS_CONSENT_WORDING, DIGEST_CONSENT_WORDING, REMINDERS_CONSENT_WORDING } from "@/lib/auth-links";
import type { EmailChoice } from "@/lib/email/unsubscribe";
import { INTERESTS, type EmailChoices, type Interest } from "@/lib/member-types";

import { setEmailChoice, setInterests, setName } from "./actions";

const EMAILS: { choice: EmailChoice; key: keyof EmailChoices; title: string; wording: string }[] = [
  { choice: "digest", key: "digest", title: "Sunday picks", wording: DIGEST_CONSENT_WORDING },
  { choice: "club_posts", key: "clubPosts", title: "New from clubs you follow", wording: CLUB_POSTS_CONSENT_WORDING },
  { choice: "reminders", key: "reminders", title: "Reminders", wording: REMINDERS_CONSENT_WORDING },
];

/** The three emails, each a switch that saves (and logs the consent, or its withdrawal) right away. */
export function EmailSettings({ emails }: { emails: EmailChoices }) {
  const [on, setOn] = useState(emails);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const flip = (choice: EmailChoice, key: keyof EmailChoices) => {
    const want = !on[key];
    setOn((o) => ({ ...o, [key]: want }));
    setError(null);
    start(async () => {
      const saved = await setEmailChoice(choice, want);
      if (saved.ok) {
        updateMember((m) => ({ ...m, emails: { ...m.emails, [key]: want } }));
        return;
      }
      setOn((o) => ({ ...o, [key]: !want }));
      setError(saved.error);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {EMAILS.map(({ choice, key, title, wording }) => (
        <label key={choice} className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl py-1">
          <span className="min-w-0">
            <span className="block text-base font-semibold">{title}</span>
            <span className="block text-xs leading-snug text-maroon/80">{wording}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={on[key]}
            disabled={pending}
            onChange={() => flip(choice, key)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-maroon ${on[key] ? "bg-maroon" : "bg-maroon/25"}`}
          >
            <span className={`absolute top-1 size-5 rounded-full bg-cream shadow transition-[left] ${on[key] ? "left-6" : "left-1"}`} />
          </span>
        </label>
      ))}
      {error && (
        <p role="alert" className="text-sm font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}

/** Interest chips; each tap saves the whole set. */
export function InterestSettings({ interests }: { interests: Interest[] }) {
  const [picked, setPicked] = useState(new Set(interests));
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const toggle = (key: Interest) => {
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPicked(next);
    setError(null);
    start(async () => {
      const saved = await setInterests([...next]);
      if (saved.ok) updateMember((m) => ({ ...m, interests: [...next] }));
      else setError(saved.error);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {INTERESTS.map((i) => (
          <button
            key={i.key}
            type="button"
            aria-pressed={picked.has(i.key)}
            onClick={() => toggle(i.key)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ring-1 transition-colors ${
              picked.has(i.key) ? "bg-maroon text-cream ring-maroon" : "bg-white/70 ring-maroon/25"
            }`}
          >
            {i.label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}

/** The name we greet them by. */
export function NameSetting({ name }: { name: string | null }) {
  const [value, setValue] = useState(name ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setStatus(null);
        start(async () => {
          const saved = await setName(value);
          setStatus(saved.ok ? "Saved." : saved.error);
          if (saved.ok) updateMember((m) => ({ ...m, name: value.trim() || null }));
        });
      }}
    >
      <label className={LABEL}>
        Your name <span className="font-normal text-maroon/75">(what our emails call you)</span>
        <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={60} autoComplete="given-name" className={INPUT} />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={BUTTON_LIGHT}>
          {pending ? "Saving…" : "Save name"}
        </button>
        {status && (
          <p role="status" className="text-sm font-semibold">
            {status}
          </p>
        )}
      </div>
    </form>
  );
}

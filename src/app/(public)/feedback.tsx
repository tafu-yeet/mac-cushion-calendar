"use client";

import { createContext, useActionState, useCallback, useContext, useEffect, useId, useRef, useState } from "react";

import { CloseIcon } from "@/components/icons";
import { CANCELLED_MESSAGE, FEEDBACK_TYPES, MAX_CONTACT, MAX_MESSAGE, type FeedbackType } from "@/lib/feedback";

import { sendFeedback } from "./feedback-actions";

// The feedback form: a bottom sheet on phones, a small dialog on wider
// screens. It only opens from a link (FeedbackLink), never by itself.

type Opening = { type: FeedbackType; event?: { id: number; name: string } };

const OpenFeedback = createContext<((opening: Opening) => void) | null>(null);

/** Holds the form for every page under it; FeedbackLinks open it. */
export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  // A new key per opening, so each one starts with a fresh form.
  const [opening, setOpening] = useState<(Opening & { key: number }) | null>(null);
  const open = useCallback((o: Opening) => setOpening({ ...o, key: Date.now() }), []);

  return (
    <OpenFeedback value={open}>
      {children}
      {opening && <FeedbackSheet key={opening.key} type={opening.type} event={opening.event} onClosed={() => setOpening(null)} />}
    </OpenFeedback>
  );
}

/** A text link that opens the form with its type (and event) chosen. */
export function FeedbackLink({ type, event, className, children }: Opening & { className?: string; children: React.ReactNode }) {
  const open = useContext(OpenFeedback);
  if (!open) return null;
  return (
    <button type="button" aria-haspopup="dialog" onClick={() => open({ type, event })} className={className}>
      {children}
    </button>
  );
}

function FeedbackSheet({ type, event, onClosed }: Opening & { onClosed: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  const titleId = useId();
  const [state, action, pending] = useActionState(sendFeedback, null);
  const [chosen, setChosen] = useState<FeedbackType>(type);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  // Said on Send rather than by the browser, whose bubble doesn't always show in a dialog (or for only spaces).
  const [askedForMessage, setAskedForMessage] = useState(false);
  const messageBox = useRef<HTMLTextAreaElement>(null);
  const messageError = useId();
  const missingMessage = askedForMessage && !message.trim();

  // Opens as a modal (focus stays inside, Escape closes it) and stops the page scrolling behind.
  useEffect(() => {
    dialog.current?.showModal();
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
    };
  }, []);

  const close = () => dialog.current?.close();
  const placeholder = FEEDBACK_TYPES.find((t) => t.key === chosen)?.placeholder;

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClosed}
      // A tap on the dimmed page around the sheet closes it (only when it started there too, not a drag out of the text box).
      onPointerDown={(e) => (pressedBackdrop.current = e.target === dialog.current)}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === dialog.current) close();
      }}
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-[32px] bg-panel p-0 font-body text-maroon shadow-xl transition-transform duration-200 backdrop:bg-plum/45 max-sm:starting:translate-y-full sm:m-auto sm:max-w-md sm:rounded-[32px]"
    >
      <div className="flex flex-col gap-4 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-display text-2xl font-semibold lowercase">
            {state?.status === "sent" ? "sent!" : "send feedback"}
          </h2>
          <button type="button" onClick={close} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-maroon/10">
            <CloseIcon className="size-5" />
          </button>
        </div>

        {state?.status === "sent" ? (
          <div className="flex flex-col items-start gap-4 pb-2">
            <p className="font-display text-3xl font-semibold leading-tight lowercase">thanks, we read every one 🛋️</p>
            <button type="button" onClick={close} className="rounded-full bg-maroon px-5 py-2 text-sm font-semibold text-cream hover:bg-plum">
              Close
            </button>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              if (message.trim()) return;
              e.preventDefault(); // stops the action too
              setAskedForMessage(true);
              messageBox.current?.focus();
            }}
            // Which page they were on, read when they send it.
            action={(formData) => {
              formData.set("page_url", window.location.href);
              action(formData);
            }}
            className="flex flex-col gap-4"
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold">What&apos;s this about?</legend>
              <div className="grid grid-cols-2 gap-2">
                {FEEDBACK_TYPES.map((t) => (
                  <label
                    key={t.key}
                    className="cursor-pointer rounded-full px-3 py-2 text-center text-sm font-semibold ring-1 ring-maroon/25 transition-colors hover:bg-butter/60 has-checked:bg-maroon has-checked:text-cream has-checked:ring-maroon has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-maroon"
                  >
                    <input
                      type="radio"
                      name="type"
                      value={t.key}
                      checked={chosen === t.key}
                      onChange={() => setChosen(t.key)}
                      className="sr-only"
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {event && (
              <>
                <input type="hidden" name="event_id" value={event.id} />
                <p className="rounded-2xl bg-canvas px-4 py-2.5 text-sm">
                  <span className="font-semibold">Event:</span> {event.name}
                </p>
              </>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="flex flex-col gap-1.5">
                <span className="flex items-baseline justify-between gap-3 text-sm font-semibold">
                  Message
                  <span className={`text-xs font-medium tabular-nums ${message.length > MAX_MESSAGE - 50 ? "text-maroon" : "text-maroon/75"}`}>
                    {message.length}/{MAX_MESSAGE}
                  </span>
                </span>
                <textarea
                  ref={messageBox}
                  name="message"
                  required
                  aria-invalid={missingMessage}
                  aria-describedby={missingMessage ? messageError : undefined}
                  rows={4}
                  maxLength={MAX_MESSAGE}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={placeholder}
                  className={`resize-none rounded-2xl bg-white/70 px-4 py-3 text-base ring-1 placeholder:text-maroon/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon ${
                    missingMessage ? "ring-2 ring-maroon" : "ring-maroon/20"
                  }`}
                />
              </label>
              {missingMessage && (
                <p id={messageError} role="alert" className="text-sm font-semibold">
                  Please enter a message.
                </p>
              )}
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">
                How can we reach you? <span className="font-medium text-maroon/75">(optional)</span>
              </span>
              <input
                name="contact"
                type="text"
                autoComplete="email"
                maxLength={MAX_CONTACT}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="@yourhandle or you@email.com"
                className="rounded-full bg-white/70 px-4 py-2.5 text-base ring-1 ring-maroon/20 placeholder:text-maroon/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon"
              />
            </label>

            {/* People never see this; bots fill it in. */}
            <div aria-hidden="true" className="absolute -left-[9999px]">
              <input name="website" type="text" tabIndex={-1} autoComplete="off" />
            </div>

            {state?.status === "error" && (
              <p role="alert" className="rounded-2xl bg-blush px-4 py-2.5 text-sm font-semibold">
                {state.message}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-maroon px-5 py-3 font-display text-lg font-semibold text-cream lowercase transition-colors hover:bg-plum disabled:opacity-70"
            >
              {pending ? "sending…" : "send"}
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}

/** "Missing an event? Tell us.", under a list of events. */
export function MissingEventLink() {
  return (
    <FeedbackLink type="missing_event" className="mx-auto mt-1 px-3 py-2 text-sm text-maroon/80 hover:text-maroon">
      Missing an event? <span className="font-semibold text-maroon underline underline-offset-2">Tell us.</span>
    </FeedbackLink>
  );
}

/** "This got cancelled" on an event page: a tap, then a confirm; two reports for one event flag it for review. */
export function CancelledReport({ eventId, className }: { eventId: number; className?: string }) {
  const [state, action, pending] = useActionState(sendFeedback, null);
  const [asking, setAsking] = useState(false);

  if (state?.status === "sent") {
    return (
      <p role="status" className="text-sm font-medium">
        Thanks! We&apos;ll check with the club.
      </p>
    );
  }
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={className}>
        This got cancelled
      </button>
    );
  }
  return (
    <form
      action={(formData) => {
        formData.set("page_url", window.location.href);
        action(formData);
      }}
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      <input type="hidden" name="type" value="cancelled" />
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="message" value={CANCELLED_MESSAGE} />
      <span className="font-medium">Did the club cancel it?</span>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-red-600 px-3 py-1 font-semibold text-white ring-1 ring-white/50 hover:bg-red-700 disabled:opacity-70"
      >
        {pending ? "Sending…" : "Yes, it's cancelled"}
      </button>
      <button type="button" onClick={() => setAsking(false)} className="rounded-full px-3 py-1 font-semibold ring-1 ring-current/40 hover:bg-current/10">
        No
      </button>
      {state?.status === "error" && (
        <p role="alert" className="w-full font-medium">
          {state.message}
        </p>
      )}
    </form>
  );
}

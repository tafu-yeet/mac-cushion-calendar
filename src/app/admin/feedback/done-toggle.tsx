"use client";

import { useOptimistic, useTransition } from "react";

import { setFeedbackDone } from "./actions";

/** The "Done" checkbox: ticks at once, then saves. */
export function DoneToggle({ id, done }: { id: number; done: boolean }) {
  const [shown, setShown] = useOptimistic(done);
  const [, startTransition] = useTransition();
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium text-stone-700">
      <input
        type="checkbox"
        checked={shown}
        onChange={(e) => {
          const next = e.target.checked;
          startTransition(async () => {
            setShown(next);
            await setFeedbackDone(id, next);
          });
        }}
        className="size-4 accent-stone-900"
      />
      Done
    </label>
  );
}

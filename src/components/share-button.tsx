"use client";

import { useState } from "react";

import { ShareIcon } from "./icons";
import { DrawnCheck, Swap } from "./motion";

/** Opens the phone's share sheet, or copies the link where that isn't available. */
export function ShareButton({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const [copies, setCopies] = useState(0); // the check draws itself on each copy

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // The person closed the share sheet.
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setCopies((n) => n + 1);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={share}
      className="press inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-current/30 hover:bg-current/10"
    >
      <Swap
        on={copied}
        off={
          <>
            <ShareIcon className="size-4" />
            Share
          </>
        }
      >
        <DrawnCheck drawn={copies} />
        Link copied
      </Swap>
    </button>
  );
}

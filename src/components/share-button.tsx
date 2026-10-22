"use client";

import { useState } from "react";

import { ShareIcon } from "./icons";

/** Opens the phone's share sheet, or copies the link where that isn't available. Shares this page unless given a path. */
export function ShareButton({ title, text, path, label = "Share" }: { title: string; text: string; path?: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = new URL(path ?? window.location.href, window.location.href).toString();
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
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-current/30 hover:bg-current/10"
    >
      <ShareIcon className="size-4" />
      {copied ? "Link copied" : label}
    </button>
  );
}

"use client";

import { useState } from "react";

import { removeFromWaitlist } from "./actions";

/** A share link with a button that copies it. */
export function CopyLink({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-white px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-medium text-stone-500">{label}</p>
        <p className="truncate font-mono text-sm">{url}</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="shrink-0 rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function RemoveButton({ id, email }: { id: number; email: string }) {
  return (
    <form
      action={removeFromWaitlist.bind(null, id)}
      onSubmit={(e) => {
        if (!confirm(`Remove ${email} from the waitlist?`)) e.preventDefault();
      }}
    >
      <button type="submit" className="text-xs text-red-700 hover:underline">
        Remove
      </button>
    </form>
  );
}

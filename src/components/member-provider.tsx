"use client";

import { usePathname } from "next/navigation";
import { createContext, use, useEffect, useSyncExternalStore } from "react";

import type { Member } from "@/lib/member-types";

// The signed-in member, shared by every part of the page that needs them (the header, cards,
// the feed's filters). Signed-out browsers never ask the server anything: no session cookie,
// no request. Signed-in ones fetch /api/me once per page load, unless the page already
// rendered the member on the server (the home feed) and handed them over with <MemberSeed>.

type State = { member: Member | null; ready: boolean };

const SESSION_COOKIE = /(?:^|;\s*)sb-[^=]+-auth-token(?:\.\d+)?=/;
const SERVER: State = { member: null, ready: false };

let state: State = SERVER;
let asked = false;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function load() {
  if (asked) return;
  asked = true;
  // After this render's seeds, so a page that brought the member along isn't asked again.
  queueMicrotask(() => {
    if (state.ready) return;
    if (!SESSION_COOKIE.test(document.cookie)) return set({ member: null, ready: true });
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Member | null>) : null))
      .catch(() => null)
      .then((member) => {
        if (!state.ready) set({ member, ready: true });
      });
  });
}

/** Changes the member here after a Server Action saved it (a follow, a reminder). */
export function updateMember(change: (m: Member) => Member) {
  if (state.member) set({ ...state, member: change(state.member) });
}

const Seed = createContext<Member | null | undefined>(undefined);

/** Hands the member the server already read to everything inside, with no flash or second request. */
export function MemberSeed({ member, children }: { member: Member | null; children: React.ReactNode }) {
  useEffect(() => {
    asked = true;
    // The server knows best whether someone's signed in (they may have just signed in or out).
    if (!state.ready || !!member !== !!state.member) set({ member, ready: true });
  }, [member]);
  return <Seed value={member}>{children}</Seed>;
}

/**
 * Keeps the member in step with the sign-in cookie from page to page. Signing in with a code or
 * a password, or signing out, moves to a new page without reloading it, and this store outlives
 * the move. Render it once, inside <Suspense> (it reads the URL).
 */
export function MemberSync() {
  const path = usePathname();
  useEffect(() => {
    if (!state.ready) return;
    const signedIn = SESSION_COOKIE.test(document.cookie);
    if (signedIn === !!state.member) return;
    if (!signedIn) return set({ member: null, ready: true });
    asked = false;
    set({ member: null, ready: false });
    load();
  }, [path]);
  return null;
}

/**
 * The signed-in member (null when signed out), and whether that's known yet. Before it's
 * known, a page's seed stands in, so what the server rendered and the first paint agree.
 */
export function useMember(): { member: Member | null; ready: boolean } {
  const seed = use(Seed);
  const current = useSyncExternalStore(subscribe, () => state, () => SERVER);
  useEffect(load, []);
  if (current.ready) return current;
  return seed === undefined ? current : { member: seed, ready: true };
}

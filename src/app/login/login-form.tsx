"use client";

import { useActionState } from "react";

import { signIn } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-md border border-stone-300 bg-white px-3 py-2 font-normal focus:border-stone-500 focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-stone-300 bg-white px-3 py-2 font-normal focus:border-stone-500 focus:outline-none"
        />
      </label>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

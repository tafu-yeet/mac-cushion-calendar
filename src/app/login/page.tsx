import type { Metadata } from "next";
import { Suspense } from "react";

import { campus } from "@/lib/campus";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Admin sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{campus.siteName} admin</h1>
        <p className="mb-5 mt-1 text-sm text-stone-600">Sign in to review events and manage clubs.</p>
        <Suspense>
          <NotAdminNotice searchParams={searchParams} />
        </Suspense>
        <LoginForm />
      </div>
    </main>
  );
}

async function NotAdminNotice({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { error } = await searchParams;
  if (error !== "not-admin") return null;
  return (
    <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
      That account isn&apos;t an admin. Sign in with the admin account.
    </p>
  );
}

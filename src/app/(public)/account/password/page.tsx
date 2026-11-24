import type { Metadata } from "next";
import { Suspense } from "react";

import { CARD, PAGE, TITLE } from "@/components/member-styles";
import { requireMember } from "@/lib/auth";

import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Set a password", robots: { index: false } };

// Optional: codes and Google work without one. Also where "Forgot your password?" ends up.
export default function PasswordPage({ searchParams }: PageProps<"/account/password">) {
  return (
    <div className={PAGE}>
      <h1 className={TITLE}>set a password</h1>
      <div className={CARD}>
        <Suspense fallback={<div className="h-40" />}>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/account/password">["searchParams"] }) {
  const [member, params] = await Promise.all([requireMember("/account/password"), searchParams]);
  return <PasswordForm email={member.email} reset={params.reset === "1"} />;
}

import "server-only";

import { campus } from "@/lib/campus";

// Sends one email through Resend's API with fetch (no SDK). The Idempotency-Key means a retry
// of the same request within 24 hours never sends a second copy; email_sends' unique key is
// the guard beyond that.

export type Outgoing = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  idempotencyKey: string;
};

export type SendResult = { ok: true; id: string } | { ok: false; error: string; retryable: boolean };

export async function sendEmail(email: Outgoing): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY isn't set", retryable: false };
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({
        from: campus.email.from,
        to: [email.to],
        reply_to: campus.email.contact,
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: email.headers,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return { ok: false, error: `network: ${e instanceof Error ? e.message : String(e)}`, retryable: true };
  }
  const body = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
  if (res.ok && body?.id) return { ok: true, id: body.id };
  return {
    ok: false,
    error: `${res.status} ${body?.name ?? ""} ${body?.message ?? ""}`.trim().slice(0, 500),
    retryable: res.status === 429 || res.status >= 500,
  };
}

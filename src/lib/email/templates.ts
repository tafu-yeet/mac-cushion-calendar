// The three member emails, as HTML (inline styles: email apps ignore style sheets) and plain
// text. Every one ends with the footer Canada's anti-spam law (CASL) asks for: who it's from, a
// mailing address, a way to reach us, why they got it, and a one-tap unsubscribe.

import { campus } from "@/lib/campus";
import type { PublicEvent } from "@/lib/events";
import { formatTimeRange } from "@/lib/time";

import { emailDay, type DigestPicks } from "./select";
import { CHOICE_NAMES, type EmailChoice, unsubscribeUrl } from "./unsubscribe";

export type Rendered = { subject: string; html: string; text: string };
export type Recipient = { name: string | null; token: string };

const MAROON = "#7a1f3d";
const CREAM = "#fff4e6";
const PINK = "#ffe3ea";
const GOLD = "#f9b93b";
const SENDER = campus.email.from.replace(/\s*<.*>$/, "");

const WHY: Record<EmailChoice, string> = {
  digest: "you turned on Sunday picks",
  club_posts: "you turned on emails when clubs you follow post",
  reminders: "you tapped Remind me on this event",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] || null;

function eventLink(site: string, e: PublicEvent, medium: string): string {
  return `${site}/events/${e.id}?utm_source=email&utm_medium=${medium}`;
}

function when(e: PublicEvent): string {
  return `${emailDay(e.startsAt)}, ${formatTimeRange(e.startsAt, e.endsAt, e.startTimeKnown)}`;
}

function eventHtml(site: string, e: PublicEvent, medium: string): string {
  const food = e.hasFreeFood ? `<span style="background:${GOLD};color:${MAROON};border-radius:999px;padding:2px 8px;font-size:12px;font-weight:700">Free food</span> ` : "";
  return `<tr><td style="padding:12px 0;border-bottom:1px solid #f0d6dd">
  <a href="${esc(eventLink(site, e, medium))}" style="color:${MAROON};font-size:17px;font-weight:700;text-decoration:none">${esc(e.name)}</a><br>
  <span style="font-size:14px;color:${MAROON}">${food}${esc(when(e))}${e.location ? ` · ${esc(e.location)}` : ""}</span><br>
  <span style="font-size:13px;color:#8f4d66">${esc(e.hostedBy ?? e.clubName)}${e.scheduleStatus === "postponed" ? " · Postponed" : ""}</span>
</td></tr>`;
}

function eventText(site: string, e: PublicEvent, medium: string): string {
  return [`- ${e.name}${e.hasFreeFood ? " (free food)" : ""}`, `  ${when(e)}${e.location ? ` · ${e.location}` : ""}`, `  ${e.hostedBy ?? e.clubName}`, `  ${eventLink(site, e, medium)}`].join("\n");
}

function footer(site: string, to: Recipient, choice: EmailChoice) {
  const one = unsubscribeUrl(site, to.token, choice);
  const all = unsubscribeUrl(site, to.token, "all");
  const html = `<p style="margin:28px 0 0;font-size:12px;line-height:1.6;color:#8f4d66">
  You're getting this because ${WHY[choice]} on ${esc(campus.siteName)}.<br>
  <a href="${esc(one)}" style="color:${MAROON}">Unsubscribe from ${esc(CHOICE_NAMES[choice])}</a> ·
  <a href="${esc(all)}" style="color:${MAROON}">Unsubscribe from everything</a> ·
  <a href="${esc(site)}/account" style="color:${MAROON}">Your email settings</a><br>
  ${esc(SENDER)} · ${esc(campus.email.mailingAddress)} · <a href="mailto:${esc(campus.email.contact)}" style="color:${MAROON}">${esc(campus.email.contact)}</a><br>
  A student project, not affiliated with ${esc(campus.school)}.
</p>`;
  const text = [
    "",
    "--",
    `You're getting this because ${WHY[choice]} on ${campus.siteName}.`,
    `Unsubscribe from ${CHOICE_NAMES[choice]}: ${one}`,
    `Unsubscribe from everything: ${all}`,
    `Your email settings: ${site}/account`,
    `${SENDER} · ${campus.email.mailingAddress} · ${campus.email.contact}`,
    `A student project, not affiliated with ${campus.school}.`,
  ].join("\n");
  return { html, text };
}

function page(title: string, body: string, foot: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:${PINK};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${MAROON}">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:${CREAM};border-radius:24px;padding:24px">
<p style="margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">${esc(campus.siteName.toLowerCase())}</p>
${body}
${foot}
</div></div></body></html>`;
}

const hi = (to: Recipient) => (firstName(to.name) ? `Hi ${esc(firstName(to.name)!)},` : "Hi,");
const hiText = (to: Recipient) => (firstName(to.name) ? `Hi ${firstName(to.name)},` : "Hi,");

/** Sunday picks: the week ahead from followed clubs and interests, then free food. */
export function digestEmail(site: string, to: Recipient, digest: DigestPicks, weekOf: string): Rendered {
  const subject = digest.picks.length
    ? `This week: ${digest.picks[0].name}${digest.picks.length > 1 ? ` and ${digest.picks.length - 1} more` : ""}`
    : `This week: ${digest.freeFood.length} with free food`;
  const foot = footer(site, to, "digest");
  const section = (title: string, events: PublicEvent[], medium: string) =>
    events.length
      ? `<h2 style="margin:20px 0 4px;font-size:18px">${esc(title)}</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${events.map((e) => eventHtml(site, e, medium)).join("")}</table>`
      : "";
  const html = page(
    subject,
    `<h1 style="margin:0 0 8px;font-size:26px">your week, picked</h1>
<p style="margin:0;font-size:15px">${hi(to)} here's what's on from ${esc(emailDay(`${weekOf}T16:00:00Z`))}.</p>
${section("For you", digest.picks, "digest")}
${section("Free food this week", digest.freeFood, "digest_food")}
<p style="margin:20px 0 0"><a href="${esc(site)}/?day=week&utm_source=email&utm_medium=digest" style="display:inline-block;background:${MAROON};color:${CREAM};border-radius:999px;padding:10px 18px;font-weight:700;text-decoration:none">See the whole week</a></p>`,
    foot.html,
  );
  const text = [
    hiText(to),
    `Here's what's on from ${emailDay(`${weekOf}T16:00:00Z`)}.`,
    ...(digest.picks.length ? ["", "FOR YOU", ...digest.picks.map((e) => eventText(site, e, "digest"))] : []),
    ...(digest.freeFood.length ? ["", "FREE FOOD THIS WEEK", ...digest.freeFood.map((e) => eventText(site, e, "digest_food"))] : []),
    "",
    `The whole week: ${site}/?day=week`,
    foot.text,
  ].join("\n");
  return { subject, html, text };
}

/** New events from clubs the member follows (at most one email a day). */
export function clubPostsEmail(site: string, to: Recipient, events: PublicEvent[]): Rendered {
  const clubs = [...new Set(events.map((e) => e.clubName))];
  const subject = events.length === 1 ? `New from ${events[0].clubName}: ${events[0].name}` : `New from ${clubs[0]}${clubs.length > 1 ? ` and ${clubs.length - 1} more` : ""}`;
  const foot = footer(site, to, "club_posts");
  const html = page(
    subject,
    `<h1 style="margin:0 0 8px;font-size:26px">new from clubs you follow</h1>
<p style="margin:0;font-size:15px">${hi(to)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${events.map((e) => eventHtml(site, e, "club_posts")).join("")}</table>`,
    foot.html,
  );
  const text = [hiText(to), "New from clubs you follow:", "", ...events.map((e) => eventText(site, e, "club_posts")), foot.text].join("\n");
  return { subject, html, text };
}

/** An hour before an event the member tapped Remind me on. */
export function reminderEmail(site: string, to: Recipient, e: PublicEvent): Rendered {
  const subject = `Soon: ${e.name}, ${formatTimeRange(e.startsAt, e.endsAt, e.startTimeKnown)}`;
  const foot = footer(site, to, "reminders");
  const html = page(
    subject,
    `<h1 style="margin:0 0 8px;font-size:26px">starting soon</h1>
<p style="margin:0;font-size:15px">${hi(to)} you asked us to remind you.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${eventHtml(site, e, "reminder")}</table>
<p style="margin:12px 0 0;font-size:13px">Plans change: check the club's post before you go.</p>`,
    foot.html,
  );
  const text = [hiText(to), "You asked us to remind you:", "", eventText(site, e, "reminder"), "", "Plans change: check the club's post before you go.", foot.text].join("\n");
  return { subject, html, text };
}

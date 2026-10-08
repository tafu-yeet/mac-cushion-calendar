import { ImageResponse } from "next/og";

import { campus } from "@/lib/campus";
import { categoryOf } from "@/lib/categories";
import { getEvent } from "@/lib/events";
import { formatDay, formatTimeRange, toLocalInputs } from "@/lib/time";

// The preview card shown when an event link is shared in a chat.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Event details";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEvent(Number(id));

  const title = event?.name ?? campus.siteName;
  // Free food leads when there is some; otherwise the kind of event.
  const description = !event
    ? "Things to do on campus"
    : event.hasFreeFood
      ? (event.foodDescription ?? "Free food")
      : [categoryOf(event.category).label, event.cost === "paid" ? event.price : null].filter(Boolean).join(" · ");
  const highlight = description.charAt(0).toUpperCase() + description.slice(1);
  const color = event && !event.hasFreeFood ? "#57534e" : "#047857";
  const when = event
    ? `${formatDay(toLocalInputs(event.startsAt).date)} · ${formatTimeRange(event.startsAt, event.endsAt, event.startTimeKnown)}`
    : "";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#fafaf9", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 28, color: "#78716c" }}>{event ? event.clubName : campus.siteName}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, color: "#1c1917", lineHeight: 1.1 }}>{title}</div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 600, color }}>{highlight}</div>
          {when && <div style={{ display: "flex", fontSize: 32, color: "#44403c" }}>{when}</div>}
          {event?.location && <div style={{ display: "flex", fontSize: 28, color: "#78716c" }}>{event.location}</div>}
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#a8a29e" }}>{campus.siteName}</div>
      </div>
    ),
    size,
  );
}

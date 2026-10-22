import { ImageResponse } from "next/og";

import { campus } from "@/lib/campus";

// The preview card shown when the waitlist link is shared in a chat.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${campus.siteName}: join the waitlist`;

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#ffe3ea", padding: 64, fontFamily: "sans-serif", color: "#7a1f3d" }}>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 600 }}>{campus.siteName.toLowerCase()}</div>
        <div style={{ display: "flex", fontSize: 92, fontWeight: 700, lineHeight: 0.95, letterSpacing: -3 }}>
          never miss free food at {campus.schoolNickname.toLowerCase()} again
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", background: "#7a1f3d", color: "#f9b93b", borderRadius: 999, padding: "16px 36px", fontSize: 36, fontWeight: 700 }}>
            join the waitlist
          </div>
          <div style={{ display: "flex", fontSize: 30, opacity: 0.8 }}>Every {campus.schoolShortName} event in one place</div>
        </div>
      </div>
    ),
    size,
  );
}

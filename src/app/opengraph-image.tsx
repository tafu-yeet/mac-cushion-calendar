import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { campus } from "@/lib/campus";
import { SITE_URL } from "@/lib/site-url";

// The preview card shown when the site's link is shared in a chat. Pages
// with their own card (events, the waitlist) replace it; the rest use this one.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${campus.siteName}: every ${campus.schoolShortName} event in one place`;

const MAROON = "#7a1f3d";
const GOLD = "#f9b93b";
const CREAM = "#fff4e6";

const logo = `data:image/png;base64,${await readFile(join(process.cwd(), "src/app/icon.png"), "base64")}`;
const domain = new URL(SITE_URL).host.replace(/^www\./, "");

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: MAROON, padding: 64, fontFamily: "sans-serif", color: CREAM }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain <img> */}
          <img src={logo} width={84} height={84} alt="" style={{ borderRadius: 999 }} />
          <div style={{ display: "flex", fontSize: 36, fontWeight: 600 }}>{campus.siteName.toLowerCase()}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", fontSize: 96, fontWeight: 700, lineHeight: 0.98, letterSpacing: -3 }}>
          <div style={{ display: "flex" }}>every {campus.schoolShortName.toLowerCase()} event,</div>
          <div style={{ display: "flex", color: GOLD }}>in one place.</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 14, fontSize: 30, fontWeight: 600 }}>
            <div style={{ display: "flex", background: GOLD, color: MAROON, borderRadius: 999, padding: "10px 26px" }}>free food</div>
            {["socials", "sports", "talks"].map((label) => (
              <div key={label} style={{ display: "flex", border: `3px solid ${CREAM}`, borderRadius: 999, padding: "7px 24px", opacity: 0.85 }}>
                {label}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 30, opacity: 0.75 }}>{domain}</div>
        </div>
      </div>
    ),
    size,
  );
}

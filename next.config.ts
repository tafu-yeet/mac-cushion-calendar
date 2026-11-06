import path from "node:path";

import type { NextConfig } from "next";
import { HTML_LIMITED_BOT_UA_RE_STRING } from "next/dist/shared/lib/router/utils/is-bot";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Event pages stream their metadata into <body>, and it stays there once the page has run. Google only
  // accepts a canonical tag in <head>, so Googlebot joins the bots (Next's list) that get it there.
  htmlLimitedBots: new RegExp(`Googlebot|${HTML_LIMITED_BOT_UA_RE_STRING}`, "i"),
  turbopack: {
    // Pin the root to this folder; a stray lockfile in the home directory
    // would otherwise be picked up as the workspace root.
    root: path.join(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

import path from "node:path";

import type { NextConfig } from "next";
import { HTML_LIMITED_BOT_UA_RE_STRING } from "next/dist/shared/lib/router/utils/is-bot";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Event pages stream their metadata into <body>, and it stays there once the page has run. Google only
  // accepts a canonical tag in <head>, so Googlebot joins the bots (Next's list) that get it there.
  htmlLimitedBots: new RegExp(`Googlebot|${HTML_LIMITED_BOT_UA_RE_STRING}`, "i"),
  // The old admin sign-in page: everyone signs in on /sign-in now, and old bookmarks still work.
  async redirects() {
    return [{ source: "/login", destination: "/sign-in?next=/admin", permanent: false }];
  },
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

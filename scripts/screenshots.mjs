// Full-page screenshots of the main public pages at phone (390px) and desktop
// width, for reviewing a change. Drives the Edge (or Chrome) already
// installed, so playwright-core downloads no browser.
//
//   node scripts/screenshots.mjs [outDir] [baseUrl]
//   node scripts/screenshots.mjs screenshots/phase-1 http://localhost:3000

import { mkdir } from "node:fs/promises";

import { chromium } from "playwright-core";

const outDir = process.argv[2] ?? "screenshots/latest";
const base = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");

const SIZES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
};

async function launch() {
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel });
    } catch {
      // try the next installed browser
    }
  }
  throw new Error("No Edge or Chrome found to take screenshots with.");
}

async function settle(page) {
  await page.waitForSelector("main h1", { timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready);
}

await mkdir(outDir, { recursive: true });
const browser = await launch();
try {
  for (const [name, options] of Object.entries(SIZES)) {
    const context = await browser.newContext({ ...options, timezoneId: "America/Toronto", locale: "en-CA" });
    const page = await context.newPage();

    await page.goto(`${base}/`);
    await settle(page);
    // The first event on the home page stands in for "an event page".
    const eventPath = await page.locator('main a[href^="/events/"]').first().getAttribute("href");

    for (const [label, path] of [["home", "/"], ["week", "/week"], ["event", eventPath]]) {
      if (!path) continue;
      await page.goto(`${base}${path}`);
      await settle(page);
      const file = `${outDir}/${label}-${name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
    }
    await context.close();
  }
} finally {
  await browser.close();
}

// Loads Rubric pages in the installed Edge and logs every POST the page makes
// to api.hellorubric.com (its `endpoint` and `details` form fields), to find
// which API calls a page uses. A one-off discovery tool, not part of the worker.
//
//   node scripts/rubric-requests.mjs <url> [<url> ...] > requests.json

import { chromium } from "playwright-core";

const urls = process.argv.slice(2);
if (!urls.length) {
  console.error("usage: node scripts/rubric-requests.mjs <url> [<url> ...]");
  process.exit(1);
}

async function launch() {
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel });
    } catch {
      // try the next installed browser
    }
  }
  throw new Error("No Edge or Chrome found.");
}

const browser = await launch();
const calls = [];
try {
  const page = await browser.newPage();
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().startsWith("https://api.hellorubric.com")) return;
    const form = new URLSearchParams(request.postData() ?? "");
    let details = form.get("details");
    try {
      details = JSON.parse(details);
    } catch {
      // leave it as text
    }
    calls.push({ page: page.url(), endpoint: form.get("endpoint"), details });
  });
  for (const url of urls) {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(1500);
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(calls, null, 1));

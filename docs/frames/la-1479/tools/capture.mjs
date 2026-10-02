// LA-1479. Captures the shipped page's own Section drawing in the states the
// frames need, so every stroke in the frames is the live renderer's, not a
// redraw. Point it at the page rendered from the MN Test #4 fixture
// (/b/fixture on a dev server, or a static copy of its HTML with
// public/scrollcraft beside it).
//
// Run: node tools/capture.mjs http://localhost:8765/index.html
// Writes data/section-style.css and data/section-<key>.svg for each key.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const require = createRequire("/Users/mattnicosia/dev/Kulka-AI/package.json");
const { chromium } = require("playwright-core");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = process.argv[2];
if (!url) throw new Error("Pass the URL of the rendered fixture page.");

// The ledger row each frame stands on: its layer is the current one, and every
// layer above it is drawn. "line:39" is the last row, so the section is whole.
const STATES = ["element:demolition", "element:elevator", "line:28", "line:39"];

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(url);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);

const style = await page.evaluate(() => [...document.head.querySelectorAll("style")].map((s) => s.textContent).join("\n"));
fs.writeFileSync(`${root}/data/section-style.css`, style);

for (const key of STATES) {
  // Bring the row to just under the lens, where the page makes it current.
  for (let i = 0; i < 6; i++) {
    await page.evaluate((key) => {
      const row = document.querySelector(`.lg-item[data-layer="${key}"]`);
      const lens = document.querySelector("[data-lens]");
      const lensBottom = lens.getBoundingClientRect().bottom;
      window.scrollBy(0, row.getBoundingClientRect().top - lensBottom - 4);
    }, key);
    await page.waitForTimeout(350);
  }
  const svg = await page.evaluate(() => document.querySelector('[data-dwg="section"]').innerHTML);
  const state = await page.evaluate(() => document.querySelector("#where-the-money-is").getAttribute("data-sc-verify-state"));
  fs.writeFileSync(`${root}/data/section-${key.replace(":", "-")}.svg`, svg);
  console.log(key, state);
}
await browser.close();

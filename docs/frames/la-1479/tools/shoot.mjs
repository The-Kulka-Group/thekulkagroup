// LA-1479. Renders every frame at 1440 and 390 wide with headless Chrome, at
// the page's full height (each frame is one scrolled state of the page, so the
// open division shows whole), then a contact sheet. Run: node tools/shoot.mjs
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const require = createRequire("/Users/mattnicosia/dev/Kulka-AI/package.json");
const { chromium } = require("playwright-core");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frames = fs.readdirSync(root).filter((f) => /^\d\d-.*\.html$/.test(f)).map((f) => f.replace(/\.html$/, "")).sort();
const sizes = [[1440, 900], [390, 844]];
fs.mkdirSync(`${root}/png`, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const f of frames) {
    await page.goto(`file://${root}/${f}.html`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) console.warn(`${f} at ${w}: ${overflow}px sideways overflow`);
    const out = `${root}/png/${f}-${w}.png`;
    await page.screenshot({ path: out, fullPage: true });
    console.log("wrote", path.relative(root, out));
    // One screen, as a reader scrolled there would see it: the focus just under the header and lens.
    const focused = await page.evaluate(() => {
      const el = document.querySelector("[data-focus]");
      if (!el) return false;
      const lens = document.querySelector("[data-lens]");
      const hd = document.querySelector(".hd").getBoundingClientRect().height;
      const lensH = lens && !el.closest(".moved") ? lens.getBoundingClientRect().height : 0;
      const phoneDwg = innerWidth <= 860 ? document.querySelector(".sheet--dwg")?.getBoundingClientRect().height ?? 0 : 0;
      window.scrollTo(0, el.getBoundingClientRect().top + scrollY - hd - lensH - phoneDwg - 28);
      return true;
    });
    if (focused) {
      await page.waitForTimeout(200);
      const view = `${root}/png/${f}-${w}-view.png`;
      await page.screenshot({ path: view });
      console.log("wrote", path.relative(root, view));
    }
  }
  await ctx.close();
}

const sheet = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#F6F7FB;font-family:"Open Sans",-apple-system,sans-serif;color:#55544E}
.row{display:flex;gap:20px;padding:20px;align-items:flex-start}
figure{margin:0;display:grid;gap:6px}figcaption{font-size:12px;font-weight:600}
img{display:block;border:1px solid #E6E9EF}
</style></head><body><div class="row">${frames
  .map((f) => `<figure><img src="../png/${f}-1440.png" width="360"><figcaption>${f} · 1440</figcaption></figure><figure><img src="../png/${f}-390.png" width="98"><figcaption>390</figcaption></figure>`)
  .join("")}</div></body></html>`;
fs.writeFileSync(`${root}/tools/contact-sheet.html`, sheet);
const ctx = await browser.newContext({ viewport: { width: 2900, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto(`file://${root}/tools/contact-sheet.html`);
await p.waitForTimeout(400);
await p.screenshot({ path: `${root}/png/contact-sheet.png`, fullPage: true });
console.log("wrote png/contact-sheet.png");
await browser.close();

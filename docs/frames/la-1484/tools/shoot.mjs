// LA-1479, reused for LA-1484 (a phone frame may name its own focus, the element its bottom sheet is on). Renders every frame at 1440 and 390 wide with headless Chrome:
// a full-height shot of each (the whole scrolled state), and for every opened
// state a first-screen shot, scrolled to the open division as a reader would
// see it. Then a contact sheet of the first screens. Run: node tools/shoot.mjs
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const require = createRequire("/Users/mattnicosia/dev/Kulka-AI/package.json");
const { chromium } = require("playwright-core");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frames = fs.readdirSync(root).filter((f) => /^\d\d[a-z]?-.*\.html$/.test(f)).map((f) => f.replace(/\.html$/, "")).sort();
const sizes = [[1440, 900], [390, 844]];
fs.rmSync(`${root}/png`, { recursive: true, force: true });
fs.mkdirSync(`${root}/png`, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const shots = [];
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
    // The first screen: the open division just under the header, the pinned section and the lens.
    const focused = await page.evaluate(() => {
      const el = (innerWidth <= 860 && document.querySelector("[data-focus-phone]")) || document.querySelector("[data-focus]");
      if (!el) return false;
      const lens = document.querySelector("[data-lens]");
      const hd = document.querySelector(".hd").getBoundingClientRect().height;
      const lensH = lens && !el.closest(".moved") ? lens.getBoundingClientRect().height : 0;
      const pinned = innerWidth <= 860 && !el.closest(".moved") ? (document.querySelector(".sheet--dwg")?.getBoundingClientRect().height ?? 0) : 0;
      window.scrollTo(0, el.getBoundingClientRect().top + scrollY - hd - lensH - pinned - 8);
      return true;
    });
    let view = out;
    if (focused) {
      await page.waitForTimeout(200);
      view = `${root}/png/${f}-${w}-view.png`;
      await page.screenshot({ path: view });
      console.log("wrote", path.relative(root, view));
    }
    shots.push({ f, w, view: path.basename(view), full: !focused });
  }
  await ctx.close();
}

const row = (w, width) =>
  `<div class="row">${shots
    .filter((s) => s.w === w)
    .map((s) => `<figure><img src="../png/${s.view}" width="${width}"${s.full ? ` style="height:${w === 1440 ? 275 : 325}px;object-fit:cover;object-position:top"` : ""}><figcaption>${s.f} · ${w}${s.full ? "" : " · first screen"}</figcaption></figure>`)
    .join("")}</div>`;
const sheet = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#F6F7FB;font-family:"Open Sans",-apple-system,sans-serif;color:#55544E}
.row{display:flex;gap:18px;padding:18px;align-items:flex-start}
figure{margin:0;display:grid;gap:6px}figcaption{font-size:12px;font-weight:600}
img{display:block;border:1px solid #E6E9EF}
</style></head><body>${row(1440, 440)}${row(390, 150)}</body></html>`;
fs.writeFileSync(`${root}/tools/contact-sheet.html`, sheet);
const ctx = await browser.newContext({ viewport: { width: 6000, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto(`file://${root}/tools/contact-sheet.html`);
await p.waitForTimeout(500);
const width = await p.evaluate(() => Math.ceil(Math.max(...[...document.querySelectorAll("figure")].map((f) => f.getBoundingClientRect().right)) + 18));
await p.setViewportSize({ width, height: 900 });
await p.screenshot({ path: `${root}/png/contact-sheet.png`, fullPage: true });
console.log("wrote png/contact-sheet.png");
await browser.close();

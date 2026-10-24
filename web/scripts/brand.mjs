// SealHour brand assets, generated from one mark definition (a wax seal pressed with a clock dial on the hour).
// Writes components/logo-mark.json (used by components/Logo.tsx), app/icon.svg, app/favicon.ico (16/32/48),
// app/apple-icon.png (180, opaque), app/opengraph-image.png and app/twitter-image.png (1200x630).
// Usage: node scripts/brand.mjs [previewDir]   (rasterizes with the globally installed Playwright Chromium;
// with previewDir, also saves the mark at 16/32/180 px on the dark sidenav and on white).
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
const web = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const app = (f) => path.join(web, "app", f);
const preview = process.argv[2];

const PRIMARY = "#465dff";
const NAVY = "#232e51";

// Wax seal outline in a 32x32 box: a disc with uneven soft lobes, like pressed wax.
const pts = [];
for (let i = 0; i < 120; i++) {
  const t = (i / 120) * 2 * Math.PI;
  const r = 14 + 0.9 * Math.cos(7 * t + 0.5) + 0.55 * Math.cos(11 * t) + 0.35 * Math.cos(3 * t + 2);
  pts.push(`${(16 + r * Math.sin(t)).toFixed(2)} ${(16 - r * Math.cos(t)).toFixed(2)}`);
}
const mark = {
  seal: `M${pts.join("L")}Z`,
  // Imprint: a round dial pressed into the wax, minute hand on the hour (12) and a short hour hand.
  face: { cx: 16, cy: 16, r: 9 },
  hand: "M16 9.4V16H20.4",
};
const svg = (fill = PRIMARY, face = "#fff") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
  `<path fill="${fill}" d="${mark.seal}"/>` +
  `<circle cx="16" cy="16" r="9" fill="${face}"/>` +
  `<path d="${mark.hand}" stroke="${fill}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;

writeFileSync(path.join(web, "components", "logo-mark.json"), JSON.stringify(mark) + "\n");
writeFileSync(app("icon.svg"), svg() + "\n");

const font = readFileSync(path.join(web, "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2")).toString("base64");
const html = (body, css = "") =>
  `<!doctype html><html><head><style>@font-face{font-family:Inter;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:100 900}` +
  `*{margin:0;box-sizing:border-box}body{font-family:Inter,sans-serif}${css}</style></head><body>${body}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
async function shot(w, h, body, css, opts = {}) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html(body, css));
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ omitBackground: opts.transparent ?? false, type: "png" });
}
const icon = (px, bg = "transparent", pad = 0) =>
  shot(px, px, `<div style="width:${px}px;height:${px}px;padding:${pad}px;background:${bg}">${svg()}</div>`, "svg{display:block;width:100%;height:100%}", { transparent: bg === "transparent" });

// favicon.ico: ICO header and directory, PNG payloads (supported by every current browser).
const sizes = [16, 32, 48];
const pngs = [];
for (const s of sizes) pngs.push(await icon(s));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s, e);
  head.writeUInt8(s, e + 1);
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
writeFileSync(app("favicon.ico"), Buffer.concat([head, ...pngs]));

// Apple touch icon: opaque navy square (iOS rounds the corners), mark at 70%.
writeFileSync(app("apple-icon.png"), await icon(180, NAVY, 27));

// Link preview card, 1200x630: navy like the sidenav, pitch, and the exam phase stepper.
const steps = [
  ["List frozen", "done"],
  ["Sealed 3/3", "done"],
  ["Opening", "current"],
  ["Reveal", "future"],
  ["Reserve", "future"],
];
const CHECK = `<svg viewBox="0 0 16 16" width="18" height="18"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const og = await shot(
  1200,
  630,
  `<main>
    <div class="brand"><span class="mark">${svg()}</span>SealHour</div>
    <h1>Exam papers sealed until the hour</h1>
    <p>Each paper is locked twice: a drand timelock and the exam centre's key. Nobody can read it early, not even the exam office.</p>
    <ol>${steps
      .map(([label, s], i) => `<li class="${s}">${i ? '<span class="line"></span>' : ""}<span class="dot">${s === "done" ? CHECK : i + 1}</span><span>${label}</span></li>`)
      .join("")}</ol>
  </main>`,
  `body{background:${NAVY};color:#fff}
   main{position:relative;height:630px;padding:72px 80px;overflow:hidden}
   main::after{content:"";position:absolute;right:-180px;top:-180px;width:560px;height:560px;border-radius:50%;background:radial-gradient(closest-side,rgba(70,93,255,.38),rgba(70,93,255,0))}
   .brand{display:flex;align-items:center;gap:16px;font-size:34px;font-weight:600;letter-spacing:-.01em}
   .mark svg{display:block;width:64px;height:64px}
   h1{margin-top:64px;font-size:72px;line-height:1.05;font-weight:700;letter-spacing:-.03em;max-width:900px;text-wrap:balance}
   p{margin-top:24px;font-size:27px;line-height:1.4;color:#c3cbe6;max-width:880px}
   ol{position:absolute;left:80px;bottom:64px;display:flex;align-items:center;gap:14px;list-style:none;padding:0;font-size:22px;font-weight:500}
   li{display:flex;align-items:center;gap:12px;color:#c3cbe6}
   .line{width:44px;height:3px;border-radius:2px;background:#3d4a75;margin-right:2px}
   .done .line,.current .line{background:${PRIMARY}}
   .dot{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;background:#34406a;font-size:18px;font-weight:600}
   .done .dot{background:rgba(10,207,151,.18);color:#3ee0b0}
   .current{color:#fff}
   .current .dot{background:${PRIMARY};box-shadow:0 0 0 6px rgba(70,93,255,.3)}`,
);
writeFileSync(app("opengraph-image.png"), og);
writeFileSync(app("twitter-image.png"), og);

if (preview) {
  mkdirSync(preview, { recursive: true });
  for (const [name, bg] of [["dark", NAVY], ["light", "#ffffff"]])
    for (const px of [16, 32, 180]) writeFileSync(path.join(preview, `mark-${px}-${name}.png`), await icon(px, bg));
  writeFileSync(path.join(preview, "og.png"), og);
}
await browser.close();
console.log("brand assets written: app/icon.svg, favicon.ico, apple-icon.png, opengraph-image.png, twitter-image.png");

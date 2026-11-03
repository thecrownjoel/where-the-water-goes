#!/usr/bin/env node
// Visual check: render the running dev server in headless Chrome and save screenshots.
//   node scripts/screenshot.mjs [url] [outDir] [--wait=ms] [--js="expr"]
// Uses the locally installed Chrome (CHROME_PATH to override). Not part of the app.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split(/=(.*)/s)));
const [url = 'http://localhost:5173/', outDir = 'screenshots'] = args.filter((a) => !a.startsWith('--'));
const exe = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=metal', '--hide-scrollbars'],
  defaultViewport: { width: Number(opt.w ?? 1600), height: Number(opt.h ?? 1000), deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((r) => setTimeout(r, Number(opt.wait ?? 6000)));
if (opt.js) console.log('js →', await page.evaluate(opt.js));
if (opt.after) await new Promise((r) => setTimeout(r, Number(opt.after)));
const shots = Number(opt.shots ?? 1);
for (let i = 0; i < shots; i++) {
  const file = `${outDir}/${opt.name ?? 'shot'}-${i}.png`;
  await page.screenshot({ path: file });
  console.log('saved', file);
  if (i < shots - 1) await new Promise((r) => setTimeout(r, Number(opt.every ?? 4000)));
}
console.log(logs.join('\n'));
await browser.close();

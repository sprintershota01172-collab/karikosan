import { chromium } from 'playwright';
import { serve } from './serve.mjs';
const SP = process.env.SP;
const srv = await serve(new URL('../dist', import.meta.url).pathname);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('ERR', String(e)));
page.on('console', (m) => m.type() === 'error' && console.log('CON', m.text()));
await page.goto(srv.url);
await page.waitForTimeout(800);
await page.click('nav button:nth-child(5)');
await page.waitForTimeout(400);
await page.click('text=サンプルで試す');
await page.waitForTimeout(300);
await page.click('.sheet .btn.primary');
await page.waitForTimeout(600);
for (const [i, n] of [[1, 'home'], [2, 'tasks'], [3, 'gantt'], [4, 'cal'], [5, 'settings']]) {
  await page.click(`nav button:nth-child(${i})`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SP}/k-${n}.png` });
}
await b.close(); srv.close();

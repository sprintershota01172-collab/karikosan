// E2E の共通処理（実際のブラウザで、スマートフォン・タブレット・PC の画面サイズで確かめる）
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

export const SIZES = {
  se: { width: 375, height: 667, mobile: true },
  iphone: { width: 390, height: 844, mobile: true },
  max: { width: 430, height: 932, mobile: true },
  ipad: { width: 820, height: 1180, mobile: true },
  pc: { width: 1440, height: 900, mobile: false },
};

let srv;
let browser;
export const errors = [];

export async function setup() {
  srv = await serve(new URL('../dist', import.meta.url).pathname);
  browser = await chromium.launch();
}
export async function teardown() {
  await browser?.close();
  srv?.close();
}
export const url = () => srv.url;

export async function open(size = 'iphone', { sample = true, reduced = false } = {}) {
  const s = SIZES[size];
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 2, isMobile: s.mobile, hasTouch: s.mobile, reducedMotion: reduced ? 'reduce' : 'no-preference', locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(srv.url);
  await page.waitForSelector('nav.nav');
  await page.waitForFunction(() => document.querySelector('.main .pane'));
  if (sample) await loadSample(page);
  return { ctx, page };
}

export async function tab(page, name) {
  const i = { home: 1, tasks: 2, gantt: 3, plan: 4, calendar: 5, settings: 6 }[name];
  await page.click(`nav button:nth-child(${i})`);
  await page.waitForTimeout(320);
}

export async function loadSample(page) {
  await tab(page, 'settings');
  await page.click('button:has-text("サンプルで試す")');
  await page.click('.sheet:not(.closing) .btn.primary:has-text("入れる")');
  await page.waitForTimeout(350);
}

export const sheet = (page) => page.locator('.sheet:not(.closing)').last();

/** 一覧のタスク名（表示順） */
export const listTitles = (page) => page.$$eval('.trow[data-sort-key] .title .reveal > span', (els) => els.map((e) => e.textContent));
export const ganttTitles = (page) => page.$$eval('.gline[data-sort-key] .gname .reveal > span', (els) => els.map((e) => e.textContent));

/** CDP でタッチ操作（長押し → 動かす → 離す） */
export async function touchDrag(page, from, to, { hold = 420, steps = 14, sample } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const pt = (x, y) => [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from.x, from.y) });
  await page.waitForTimeout(hold);
  const samples = [];
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x, y) });
    await page.waitForTimeout(16);
    if (sample) samples.push(await sample());
  }
  await page.waitForTimeout(120);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
  await cdp.detach();
  return samples;
}

/** ページ全体がスクロールせず、横にはみ出す要素がないか */
export function layoutReport(page) {
  return page.evaluate(() => {
    const iw = innerWidth;
    const ih = innerHeight;
    const se = document.scrollingElement;
    const pageScroll = Math.max(0, se.scrollHeight - ih);
    // .reveal の中の文字は、枠（overflow: hidden・…で省略）で切られて見えないので数えない
    const live = (el) => !el.closest('.pane.out') && !el.closest('.gscroll') && !el.closest('.chips') && !el.parentElement?.closest('.reveal');
    const wide = [...document.querySelectorAll('.app *')]
      .filter(live)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > iw + 0.5;
      })
      .map((el) => el.className || el.tagName)
      .slice(0, 5);
    // 文字が枠の上下で切れていないか（1行の要素の高さが文字より低い）
    const nav = document.querySelector('.nav').getBoundingClientRect();
    return { pageScroll, docW: se.scrollWidth, iw, wide, navBottom: nav.bottom, ih };
  });
}

/** 保存が終わるまで待つ */
export const saved = (page) => page.waitForSelector('.save-dot[data-s="saved"]', { timeout: 5000 });

/** グループを開く（一覧: 見出しの ▼、ガント: グループの行）。1つずつ開く設定なら、ほかは閉じる */
export async function openGroup(page, name) {
  const head = page.locator('.pane:not(.out) .grow-head', { hasText: name }).first();
  if (await head.count()) {
    if ((await head.locator('.fold').getAttribute('aria-expanded')) === 'false') await head.locator('.fold').click();
  } else {
    const row = page.locator('.pane:not(.out) .gline[data-level]', { hasText: name }).first();
    if ((await row.getAttribute('aria-expanded')) === 'false') await row.click();
  }
  await page.waitForTimeout(450);
}

/** 「グループは1つずつ開く」をオフにして、すべてのグループを開く */
export async function openAllGroups(page) {
  await tab(page, 'settings');
  const t = page.locator('button[aria-label="グループは1つずつ開く"]');
  if ((await t.getAttribute('aria-checked')) === 'true') await t.click();
  await tab(page, 'tasks');
  for (let i = 0; i < 20; i++) {
    const closed = page.locator('.pane:not(.out) .grow-head .fold[aria-expanded="false"]');
    if (!(await closed.count())) break;
    await closed.first().click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(300);
}

/** その行が見えるまで、入っているスクロール領域だけを動かす */
export async function showRow(page, locator) {
  await locator.evaluate((el) => {
    const sc = el.closest('.scroll, .gscroll, .sheet-body');
    const head = sc.querySelector('.ghead')?.getBoundingClientRect().height ?? 0;
    const r = el.getBoundingClientRect();
    const v = sc.getBoundingClientRect();
    if (r.top < v.top + head) sc.scrollTop -= v.top + head - r.top + 4;
    else if (r.bottom > v.bottom) sc.scrollTop += r.bottom - v.bottom + 4;
  });
  await page.waitForTimeout(150);
}

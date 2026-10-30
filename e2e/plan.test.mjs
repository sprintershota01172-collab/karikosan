// 大日程: 車種ごとのイベントを1マス1週で並べ、週ごとの負荷を見る
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { errors, open, setup, sheet, tab, teardown, touchDrag } from './helpers.mjs';

before(setup);
after(teardown);

const bar = (page, title) => page.locator('.pbar', { hasText: title }).first();
const range = async (page, title) => {
  const b = bar(page, title);
  return { start: await b.getAttribute('data-start'), end: await b.getAttribute('data-end') };
};
const weekW = (page) => page.evaluate(() => 2.5 * parseFloat(getComputedStyle(document.documentElement).fontSize));
const loadAt = (page, week) => page.$eval(`.gload[data-week="${week}"]`, (e) => Number(e.textContent || 0));
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

async function mouseDrag(page, x, y, dx, steps = 12) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x + (dx * i) / steps, y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(450);
}

describe('大日程', () => {
  it('すべて: 車種ごとに段を詰めて並べ、上の行に週ごとの負荷（重みの合計）を色で出す', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'plan');
    const lanes = await page.$$eval('.plane', (els) => els.map((e) => e.dataset.vehicle));
    assert.ok(lanes.length >= 4, `段: ${lanes.length}`);
    assert.equal(new Set(lanes).size, 3, '共通・A車・B車');
    // 重なるイベントは別の段（同じ段のバーは重ならない）
    const overlap = await page.$$eval('.plane', (rows) =>
      rows.some((r) => {
        const bs = [...r.querySelectorAll('.pbar')].map((b) => b.getBoundingClientRect());
        return bs.some((a, i) => bs.some((b, j) => i < j && a.left < b.right - 1 && b.left < a.right - 1));
      }),
    );
    assert.equal(overlap, false);
    // 負荷: サンプルでは A車の1次試作（大3）・B車の金型製作（大3）などが重なる週が「とても多い」
    const levels = await page.$$eval('.gload', (els) => els.map((e) => e.className.match(/l(\d)/)[1]));
    assert.ok(levels.includes('3') && levels.includes('1'), levels.join(''));
    await ctx.close();
  });

  it('イベントを追加すると、その車種の段に出て、その週の負荷が増える', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'plan');
    // 今週の負荷
    const week = await page.$eval('.pweek.now', (e) => e.parentElement.querySelector(`.gload[style*="left: ${e.style.left}"]`)?.dataset.week);
    const before1 = await loadAt(page, week);
    await page.click('.toolbar .chip[aria-label="イベントを追加"]');
    const s = sheet(page);
    await s.locator('input[aria-label="イベント名"]').fill('外観レビュー');
    await s.locator('select[aria-label="車種"]').selectOption({ label: 'B車（改良）' });
    await s.locator('.chip', { hasText: '評価' }).click();
    await s.locator('input[aria-label="開始の週"]').fill(week);
    await s.locator('button[aria-label="1週へらす"]').click(); // 4週 → 3週
    await s.locator('.seg[aria-label="負荷"] button', { hasText: '大' }).click();
    assert.match(await s.textContent(), /3週/);
    await s.locator('.btn.primary', { hasText: '追加' }).click();
    await page.waitForTimeout(400);
    const r = await range(page, '外観レビュー');
    assert.equal(r.start, week);
    assert.equal(r.end, addDays(week, 20));
    assert.equal(await bar(page, '外観レビュー').evaluate((b) => b.closest('.plane').dataset.vehicle !== '-'), true);
    assert.equal(await loadAt(page, week), before1 + 3, '負荷が大(3)だけ増える');
    // 車種で絞ると、その車種のイベントが1件1行で並ぶ
    await page.click('.chips .chip:has-text("B車")');
    await page.waitForTimeout(300);
    const names = await page.$$eval('.pane:not(.out) .gline .gname .grow', (els) => els.map((e) => e.textContent));
    assert.ok(names.includes('外観レビュー') && !names.includes('1次試作'), names.join(','));
    assert.equal(await page.locator('.gline.padd').count(), 1, '「タップで追加」の行');
    await ctx.close();
  });

  it('何もない所をタップすると、その週・その車種でイベントを追加できる', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'plan');
    await page.click('.chips .chip:has-text("A車")');
    await page.waitForTimeout(300);
    const cell = await page.locator('.pweek.now').boundingBox();
    const add = await page.locator('.gline.padd .gtrack').boundingBox();
    await page.mouse.click(cell.x + cell.width / 2, add.y + add.height / 2);
    await page.waitForTimeout(400);
    const s = sheet(page);
    assert.match(await s.locator('h2').textContent(), /イベントを追加/);
    const start = await s.locator('input[aria-label="開始の週"]').inputValue();
    assert.equal(new Date(start + 'T00:00:00Z').getUTCDay(), 1, '月曜');
    assert.equal(await s.locator('select[aria-label="車種"] option:checked').textContent(), 'A車（新型SUV）');
    await ctx.close();
  });

  it('PC: バーを動かすと1週ずつ動き、右端で週数を変えられる', async () => {
    const { ctx, page } = await open('pc');
    await tab(page, 'plan');
    const t = '性能評価';
    const r0 = await range(page, t);
    const w = await weekW(page);
    let b = await bar(page, t).boundingBox();
    await mouseDrag(page, b.x + b.width / 2, b.y + b.height / 2, w * 2.2);
    const r1 = await range(page, t);
    assert.equal(r1.start, addDays(r0.start, 14), `${r0.start} → ${r1.start}`);
    assert.equal(r1.end, addDays(r0.end, 14));
    b = await bar(page, t).boundingBox();
    await mouseDrag(page, b.x + b.width - 3, b.y + b.height / 2, w * 1.1);
    const r2 = await range(page, t);
    assert.equal(r2.start, r1.start);
    assert.equal(r2.end, addDays(r1.end, 7));
    await ctx.close();
  });

  it('タッチ: すぐ横に動かすと日付が横にスクロールするだけ。長押ししてから動かすと1週ずつ動く', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'plan');
    const t = '金型製作';
    const r0 = await range(page, t);
    const sc0 = await page.$eval('.gscroll', (e) => e.scrollLeft);
    let b = await bar(page, t).boundingBox();
    const y = b.y + b.height / 2;
    const x = Math.max(b.x + 12, 150);
    await touchDrag(page, { x, y }, { x: x - 90, y }, { hold: 20 });
    assert.deepEqual(await range(page, t), r0);
    assert.notEqual(await page.$eval('.gscroll', (e) => e.scrollLeft), sc0);
    b = await bar(page, t).boundingBox();
    const x2 = Math.max(b.x + 12, 150);
    const w = await weekW(page);
    await touchDrag(page, { x: x2, y: b.y + b.height / 2 }, { x: x2 + w * 1.2, y: b.y + b.height / 2 }, { hold: 400 });
    const r1 = await range(page, t);
    assert.equal(r1.start, addDays(r0.start, 7));
    await ctx.close();
  });

  it('編集: 週数を変えるとバーが伸び、削除しても「元に戻す」で戻る', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'plan');
    const t = '出図';
    const r0 = await range(page, t);
    await bar(page, t).click();
    await bar(page, t).click();
    await page.waitForTimeout(400);
    const s = sheet(page);
    await s.locator('button[aria-label="1週ふやす"]').click();
    await page.waitForTimeout(200);
    assert.equal((await range(page, t)).end, addDays(r0.end, 7));
    await s.locator('.btn.danger', { hasText: '削除' }).click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.pbar', { hasText: t }).count(), 0);
    await page.locator('.toast button', { hasText: '元に戻す' }).click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.pbar', { hasText: t }).count(), 1);
    await ctx.close();
  });

  it('「年」にすると1年を見渡せる。月の名前・週の数字・負荷の数字が重ならない', async () => {
    for (const size of ['se', 'pc']) {
      const { ctx, page } = await open(size);
      await tab(page, 'plan');
      const vis = async () => page.$eval('.gscroll', (sc) => (sc.clientWidth - sc.querySelector('.corner').offsetWidth) / sc.querySelector('.pweek').offsetWidth);
      const w1 = await vis();
      for (const z of ['週', '年']) {
        await page.locator('.seg[aria-label="1マスの幅"] button', { hasText: z }).click();
        await page.waitForTimeout(250);
        for (const pos of [0, 0.5, 1]) {
          const bad = await page.evaluate((pos) => {
            const sc = document.querySelector('.gscroll');
            sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) * pos;
            const corner = document.querySelector('.ghead .corner').getBoundingClientRect();
            const right = sc.getBoundingClientRect().right;
            const vis = (r) => r.width > 0 && r.right > corner.right + 1 && r.left < right - 1;
            const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
            const out = [];
            const els = [...document.querySelectorAll('.gmonth > span')].map((e) => ({ t: e.textContent, r: e.getBoundingClientRect() })).filter((x) => vis(x.r));
            for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) if (hit(els[i].r, els[j].r)) out.push(`${els[i].t}×${els[j].t}`);
            for (const c of document.querySelectorAll('.gload, .pweek')) if (c.scrollWidth > c.clientWidth + 1) out.push(`はみ出し ${c.textContent}`);
            return out;
          }, pos);
          assert.deepEqual(bad, [], `${size} ${z} ${pos}`);
        }
      }
      assert.ok((await vis()) > w1 * 2, '年のほうが多くの週が見える');
      await ctx.close();
    }
  });
});

describe('エラー', () => {
  it('ブラウザのエラーが出ていない', () => assert.deepEqual(errors, []));
});

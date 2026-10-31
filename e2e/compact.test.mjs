// スワイプで削除・普通の縦スクロール（送りなし）・グループを1つずつ開く・ガントの格子・文字入力で画面がずれない
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { add, errors, ganttTitles, listTitles, open, openGroup, setup, tab, teardown, touchDrag } from './helpers.mjs';

before(setup);
after(teardown);

/** 行を左へスワイプ（長押しせずにすぐ動かす） */
async function swipeLeft(page, locator, dist) {
  const b = await locator.boundingBox();
  const y = b.y + b.height / 2;
  const x = b.x + b.width - 30;
  await touchDrag(page, { x, y }, { x: x - dist, y: y + 4 }, { hold: 20, steps: 10 });
}

describe('横スワイプでタスクを消す', () => {
  it('一覧: 少しスワイプすると「削除」が出て、押すと消える。「元に戻す」で戻る', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    const t = 'ヘッドランプ取付検討';
    const row = page.locator('.trow', { hasText: t });
    await swipeLeft(page, row, 110);
    const del = page.locator('.swipe.shown .actions button', { hasText: '削除' });
    assert.equal(await del.count(), 1, '削除ボタンが出る');
    assert.ok(await del.isVisible());
    assert.ok((await listTitles(page)).includes(t), 'まだ消えていない');
    await del.click();
    await page.waitForTimeout(400);
    assert.ok(!(await listTitles(page)).includes(t), '消えた');
    await page.locator('.toast button', { hasText: '元に戻す' }).click();
    await page.waitForTimeout(400);
    assert.ok((await listTitles(page)).includes(t), '元に戻った');
    await ctx.close();
  });

  it('一覧: 大きくスワイプするとそのまま消える。並べ替えにはならない', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    const before = await listTitles(page);
    const t = 'フード開閉の干渉確認';
    await swipeLeft(page, page.locator('.trow', { hasText: t }), 280);
    await page.waitForTimeout(400);
    const after1 = await listTitles(page);
    assert.deepEqual(after1, before.filter((x) => x !== t));
    assert.match(await page.locator('.toast').textContent(), /削除しました/);
    await ctx.close();
  });

  it('一覧: スワイプして戻すと何も起きず、行をタップしても開かない', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    const before = await listTitles(page);
    const row = page.locator('.trow', { hasText: '図面の出図' });
    const b = await row.boundingBox();
    await touchDrag(page, { x: b.x + b.width - 30, y: b.y + b.height / 2 }, { x: b.x + b.width - 40, y: b.y + b.height / 2 }, { hold: 20 });
    assert.deepEqual(await listTitles(page), before);
    assert.equal(await page.locator('.sheet').count(), 0);
    await ctx.close();
  });

  it('ホーム: スワイプで「延期」「除外」「削除」。大きくスワイプで削除', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'home');
    const first = page.locator('.pane:not(.out) .swipe').first();
    const title = await first.locator('.reveal').first().textContent();
    await swipeLeft(page, first.locator('.trow'), 140);
    const labels = await page.$$eval('.swipe.shown .actions button', (els) => els.map((e) => e.textContent));
    assert.deepEqual(labels, ['延期', '除外', '削除']);
    // しまってから、大きくスワイプ
    await first.locator('.trow').click();
    await page.waitForTimeout(300);
    await swipeLeft(page, first.locator('.trow'), 300);
    await page.waitForTimeout(400);
    const now = await page.$$eval('.pane:not(.out) .swipe .reveal', (els) => els.map((e) => e.textContent));
    assert.ok(!now.includes(title), `${title} が消えた`);
    await ctx.close();
  });
});

describe('コンパクトにまとめる（送りなし）', () => {
  it('▲▼ のボタンはなく、指で縦にスクロールできる', async () => {
    const { ctx, page } = await open('se');
    await tab(page, 'tasks');
    for (let i = 1; i <= 12; i++) {
      await add(page, `追加${i}`);
    }
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.pager').count(), 0);
    const sc = page.locator('.pane:not(.out) .scroll');
    await sc.evaluate((e) => (e.scrollTop = 0));
    const box = await sc.boundingBox();
    await touchDrag(page, { x: box.x + box.width / 2, y: box.y + box.height - 40 }, { x: box.x + box.width / 2, y: box.y + 40 }, { hold: 20, steps: 8 });
    await page.waitForTimeout(500);
    assert.ok((await sc.evaluate((e) => e.scrollTop)) > 50, '縦にスクロールした');
    await ctx.close();
  });

  it('グループは1つずつ開く（開くとほかが閉じる）。ガントも同じ並び', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    await openGroup(page, '試作・評価');
    const l = await listTitles(page);
    assert.ok(l.includes('試作部品の手配') && !l.includes('バンパー形状の検討'));
    await tab(page, 'gantt');
    assert.deepEqual(await ganttTitles(page), l);
    await ctx.close();
  });
});

describe('ガントの格子', () => {
  it('日の単位では1日ごとに縦線、行ごとに横線（エクセルのような格子）。週の単位では週ごと', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'gantt');
    const g = await page.evaluate(() => {
      const grid = getComputedStyle(document.querySelector('.ggrid'));
      const dayW = 1.75 * parseFloat(getComputedStyle(document.documentElement).fontSize);
      const row = getComputedStyle(document.querySelector('.gline[data-sort-key] .gtrack'));
      return { img: grid.backgroundImage, size: parseFloat(grid.backgroundSize), dayW, rowLine: row.borderBottomWidth, months: document.querySelectorAll('.gmline').length, dayCells: getComputedStyle(document.querySelector('.gday')).borderLeftWidth };
    });
    assert.match(g.img, /linear-gradient/);
    assert.ok(Math.abs(g.size - g.dayW) < 0.6, `1日ごと: ${g.size} / ${g.dayW}`);
    assert.equal(g.rowLine, '1px');
    assert.equal(g.dayCells, '1px', '見出しの日付も区切る');
    assert.ok(g.months >= 4, '月の境目の線');
    await page.locator('.seg[aria-label="表示の単位"] button', { hasText: '週' }).click();
    await page.waitForTimeout(250);
    const w = await page.evaluate(() => ({ size: parseFloat(getComputedStyle(document.querySelector('.ggrid')).backgroundSize), dayW: 0.75 * parseFloat(getComputedStyle(document.documentElement).fontSize) }));
    assert.ok(Math.abs(w.size - w.dayW * 7) < 1, `週ごと: ${w.size}`);
    await ctx.close();
  });
});

describe('文字を打つとき', () => {
  it('「＋ タスクを追加」を押すと、入力欄が画面の上に出てすぐ打てる（キーボードより上なので画面がずれない）。続けて追加でき、閉じると元どおり', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    const head0 = await page.$eval('.top', (e) => e.getBoundingClientRect().top);
    await page.click('.quick .opener');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const inp = document.querySelector('.compose .inp');
      return { focused: document.activeElement === inp, top: inp.getBoundingClientRect().top, bottom: inp.getBoundingClientRect().bottom, vh: innerHeight };
    });
    assert.equal(r.focused, true, '押した瞬間に入力欄にフォーカス（キーボードが出る）');
    assert.ok(r.bottom < r.vh * 0.3, `入力欄は画面の上の方: ${r.top}〜${r.bottom} / ${r.vh}`);
    await page.keyboard.type('上で追加1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('上で追加2');
    await page.keyboard.press('Enter');
    assert.match(await page.textContent('.compose'), /上で追加2.*2件/);
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.compose .inp')), true, '続けて打てる');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.compose.open').count(), 0);
    assert.equal(await page.$eval('.top', (e) => e.getBoundingClientRect().top), head0);
    const l = await listTitles(page);
    assert.ok(l.includes('上で追加1') && l.includes('上で追加2'));
    await ctx.close();
  });

  it('入力画面（シート）はスマホでは上まで広がり、名前の欄が画面の上側にある', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    const row = page.locator('.trow', { hasText: '図面の出図' });
    await row.click();
    await row.click();
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({ top: document.querySelector('.sheet:not(.closing) .inp').getBoundingClientRect().top, vh: innerHeight }));
    assert.ok(r.top < r.vh * 0.3, `名前の欄 ${r.top} / ${r.vh}`);
    await ctx.close();
  });

  it('それでもキーボードで見える範囲がずれたとき（iPhone の状態を再現）は、アプリとシートを見えている範囲に合わせる', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    const row = page.locator('.trow', { hasText: '図面の出図' });
    await row.click();
    await row.click();
    await page.waitForTimeout(400);
    await page.focus('.sheet:not(.closing) .inp');
    // iPhone ではキーボードが出ても window.innerHeight は変わらず、visualViewport だけが小さくなる。
    // ここでは「innerHeight を大きくして、visualViewport の resize を出す」ことで同じ状態を作る
    const r = await page.evaluate(async () => {
      const vh = window.visualViewport.height;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: vh + 340 });
      window.visualViewport.dispatchEvent(new Event('resize'));
      await new Promise((ok) => setTimeout(ok, 450));
      const sh = document.querySelector('.sheet:not(.closing)').getBoundingClientRect();
      const head = document.querySelector('.top').getBoundingClientRect();
      return { open: document.documentElement.classList.contains('kb-open'), appH: document.querySelector('.app').getBoundingClientRect().height, vh, sheetBottom: sh.bottom, headTop: head.top, nav: getComputedStyle(document.querySelector('.nav')).display };
    });
    assert.equal(r.open, true);
    assert.ok(Math.abs(r.appH - r.vh) < 1, `高さ ${r.appH} / ${r.vh}`);
    assert.equal(r.nav, 'grid', '下のタブも動かさない（画面がブレない）');
    // 実機ではレイアウトの高さ − キーボード（340）＝ 見えている範囲の下端。ここではレイアウトの高さが変わらないので vh − 340
    assert.ok(Math.abs(r.sheetBottom - (r.vh - 340)) < 1, `シートの下端がキーボードの上: ${r.sheetBottom} / ${r.vh - 340}`);
    assert.equal(r.headTop, 0, 'ヘッダーは上にずれない');
    await page.evaluate(async () => {
      document.activeElement.blur();
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: window.visualViewport.height });
      window.visualViewport.dispatchEvent(new Event('resize'));
      await new Promise((ok) => setTimeout(ok, 450));
    });
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('kb-open')), false);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.nav')).display), 'grid');
    await ctx.close();
  });
});

describe('エラー', () => {
  it('ブラウザのエラーが出ていない', () => assert.deepEqual(errors, []));
});

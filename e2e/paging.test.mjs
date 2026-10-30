// 縦スワイプなしの設計: ▲▼ で送る・グループは1つずつ開く・PC のホイール
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { errors, ganttTitles, listTitles, open, openGroup, press, setup, tab, teardown, touchDrag } from './helpers.mjs';

before(setup);
after(teardown);

const pager = (page) => page.locator('.pane:not(.out) .pager');
const down = (page) => pager(page).locator('button[aria-label="次の画面へ"]');
const up = (page) => pager(page).locator('button[aria-label="前の画面へ"]');

async function addTasks(page, n, prefix = '追加') {
  await tab(page, 'tasks');
  for (let i = 1; i <= n; i++) {
    await page.fill('.quick .inp', `${prefix}${i}`);
    await page.press('.quick .inp', 'Enter');
  }
  await page.waitForTimeout(500);
}

/** 送り領域の先頭に見えている行が、上で切れていないか */
const topAligned = (page, view, rows, head = 0) =>
  page.evaluate(
    ([view, rows, head]) => {
      const v = document.querySelector(view);
      const vr = v.getBoundingClientRect();
      const first = [...v.querySelectorAll(rows)].map((e) => e.getBoundingClientRect()).find((r) => r.height && r.bottom > vr.top + head + 1);
      return { gap: first.top - (vr.top + head), scrollTop: v.scrollTop };
    },
    [view, rows, head],
  );

describe('▲▼ で送る', () => {
  it('一覧: 収まらないときだけ出る。行の境目で送り、上下の件数が分かる。端では押せない', async () => {
    const { ctx, page } = await open('se');
    await tab(page, 'tasks');
    await addTasks(page, 10);
    assert.equal(await pager(page).count(), 1);
    // 追加したタスクが見えるように送られている → 先頭まで戻す
    for (let i = 0; i < 10 && (await press(page, 'up')); i++) await page.waitForTimeout(450);
    await page.waitForTimeout(300);
    assert.ok(await up(page).isDisabled(), '先頭では「上」は押せない');
    assert.match(await down(page).textContent(), /下に\d+件/);
    await down(page).click();
    await page.waitForTimeout(500);
    const a = await topAligned(page, '.pane:not(.out) .scroll', '.list > *');
    assert.ok(a.scrollTop > 0, '送った');
    assert.ok(Math.abs(a.gap) < 1.5, `先頭の行が切れない: ${a.gap}`);
    assert.match(await up(page).textContent(), /上に\d+件/);
    for (let i = 0; i < 10 && (await press(page, 'down')); i++) await page.waitForTimeout(450);
    await page.waitForTimeout(300);
    assert.match(await down(page).textContent(), /最後/);
    const last = await page.locator('.trow', { hasText: '追加10' }).boundingBox();
    const box = await page.locator('.pane:not(.out) .scroll').boundingBox();
    assert.ok(last.y + last.height <= box.y + box.height + 1, '最後の行が見える');
    for (let i = 0; i < 10 && (await press(page, 'up')); i++) await page.waitForTimeout(450);
    await page.waitForTimeout(300);
    assert.equal(await page.$eval('.pane:not(.out) .scroll', (e) => e.scrollTop), 0);
    assert.match(await up(page).textContent(), /先頭/);
    await ctx.close();
  });

  it('収まっているときは ▲▼ を出さない', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'home');
    assert.equal(await pager(page).count(), 0);
    await tab(page, 'gantt');
    assert.equal(await pager(page).count(), 0);
    await ctx.close();
  });

  it('ガント: 20行ずつ送り、21行目が次の画面の先頭（日付の見出しの下）に来る。名前とバーはずれない', async () => {
    const { ctx, page } = await open('iphone');
    await addTasks(page, 30);
    await tab(page, 'gantt');
    assert.equal(await pager(page).count(), 1);
    const before = await page.evaluate(() => [...document.querySelectorAll('.gline')].map((e) => e.offsetTop));
    await down(page).click();
    await page.waitForTimeout(500);
    const head = await page.$eval('.ghead', (e) => e.getBoundingClientRect().height);
    const a = await topAligned(page, '.gscroll', '.gline', head);
    assert.ok(Math.abs(a.gap) < 1.5, `行の境目: ${a.gap}`);
    const rowH = before[1] - before[0];
    assert.equal(Math.round(a.scrollTop / rowH), 20, '20行送る');
    const drift = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.gline')].map((r) => Math.abs(r.querySelector('.gname').getBoundingClientRect().top - r.querySelector('.gtrack').getBoundingClientRect().top))));
    assert.ok(drift < 0.5);
    // 縦スワイプでは動かない
    const top0 = await page.$eval('.gscroll', (e) => e.scrollTop);
    const box = await page.locator('.gscroll').boundingBox();
    await touchDrag(page, { x: box.x + 250, y: box.y + 300 }, { x: box.x + 250, y: box.y + 100 }, { hold: 20 });
    assert.equal(await page.$eval('.gscroll', (e) => e.scrollTop), top0);
    await ctx.close();
  });

  it('PC: ホイールでは今までどおり動く', async () => {
    const { ctx, page } = await open('pc', { sample: true });
    await addTasks(page, 16);
    const box = await page.locator('.pane:not(.out) .scroll').boundingBox();
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(300);
    assert.ok((await page.$eval('.pane:not(.out) .scroll', (e) => e.scrollTop)) > 0);
    await ctx.close();
  });

  it('入力画面（シート）も、収まらないときは ▲▼ で送る', async () => {
    const { ctx, page } = await open('se');
    await tab(page, 'tasks');
    const row = page.locator('.trow', { hasText: 'バンパー形状の検討' });
    await row.click();
    await row.click();
    await page.waitForTimeout(400);
    await page.locator('.sheet:not(.closing) button:has-text("車種・グループ・担当者・メモ")').click();
    await page.waitForTimeout(300);
    const sp = page.locator('.sheet:not(.closing) .pager');
    assert.equal(await sp.count(), 1);
    await sp.locator('button[aria-label="次の画面へ"]').click();
    await page.waitForTimeout(450);
    assert.ok((await page.$eval('.sheet:not(.closing) .sheet-body', (e) => e.scrollTop)) > 0);
    await ctx.close();
  });
});

describe('グループは1つずつ開く', () => {
  it('開くとほかが閉じ、ガントも同じ並び。ガントのグループの行のタップでも開ける', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    assert.ok((await listTitles(page)).includes('バンパー形状の検討'));
    await openGroup(page, '試作・評価');
    let l = await listTitles(page);
    assert.ok(l.includes('試作部品の手配'));
    assert.ok(!l.includes('バンパー形状の検討'), 'ボデー設計は閉じた');
    assert.equal(await page.locator('.grow-head', { hasText: 'ボデー設計' }).locator('.fold').getAttribute('aria-expanded'), 'false');
    await tab(page, 'gantt');
    assert.deepEqual(await ganttTitles(page), l, 'ガントも同じ');
    await page.locator('.gline[data-level="1"]', { hasText: '金型' }).click();
    await page.waitForTimeout(450);
    const g = await ganttTitles(page);
    assert.ok(g.includes('金型日程の調整') && !g.includes('試作部品の手配'), g.join(','));
    await tab(page, 'tasks');
    l = await listTitles(page);
    assert.deepEqual(l, g);
    await ctx.close();
  });

  it('子ツリーも同じ親の中で1つずつ。設定でオフにすると、いくつでも開ける', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    await openGroup(page, 'リア周り');
    let l = await listTitles(page);
    assert.ok(l.includes('リアゲート構造の見直し') && !l.includes('バンパー形状の検討'));
    await tab(page, 'settings');
    await page.click('button[aria-label="グループは1つずつ開く"]');
    await tab(page, 'tasks');
    await openGroup(page, 'フロント周り');
    await openGroup(page, '試作・評価');
    l = await listTitles(page);
    for (const t of ['リアゲート構造の見直し', 'バンパー形状の検討', '試作部品の手配']) assert.ok(l.includes(t), t);
    await ctx.close();
  });
});

describe('エラー', () => {
  it('ブラウザのエラーが出ていない', () => assert.deepEqual(errors, []));
});

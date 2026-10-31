// 長押しのメニュー（編集・完了・削除）、ガントの車種・グループの並べ替え、上の車種のボタンの並べ替え、
// キーボードの ✓ で入力完了、報告から外す、完了したタスクの削除、大日程の今週、文字入力で画面が動かない
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { errors, ganttTitles, listTitles, open, setup, sheet, tab, teardown, touchDrag } from './helpers.mjs';

before(setup);
after(teardown);

const center = async (loc) => {
  const b = await loc.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const groupOrder = (page) => page.$$eval('.pane:not(.out) .gline[data-group-anchor] .gname .reveal > span', (els) => els.map((e) => e.textContent));
const vehicleOrder = (page) => page.$$eval('.pane:not(.out) .gline.gveh .gname .reveal > span', (els) => els.map((e) => e.textContent));

describe('長押しのメニュー', () => {
  it('ガント: 項目を長押しして離すとメニュー。完了したタスクも削除できる', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'gantt');
    const done = '構想図の確認';
    assert.ok((await ganttTitles(page)).includes(done));
    const p = await center(page.locator('.gline', { hasText: done }).locator('.gname'));
    await touchDrag(page, p, p, { steps: 1 });
    const menu = sheet(page);
    assert.match(await menu.locator('.sheet-head h2').textContent(), new RegExp(done));
    assert.deepEqual(await menu.locator('.menu .item').allTextContents(), ['編集', '未完了に戻す', '削除']);
    await menu.locator('.menu .item', { hasText: '削除' }).click();
    await page.waitForTimeout(400);
    assert.ok(!(await ganttTitles(page)).includes(done), '消えた');
    assert.match(await page.locator('.toast').textContent(), /削除しました/);
    await ctx.close();
  });

  it('一覧: タスクを長押しして離すとメニュー（編集・完了・削除）。長押しして動かすと並べ替え', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    const p = await center(page.locator('.trow', { hasText: '図面の出図' }).locator('.title'));
    await touchDrag(page, p, p, { steps: 1 });
    assert.deepEqual(await sheet(page).locator('.menu .item').allTextContents(), ['編集', '完了にする', '削除']);
    await page.keyboard.press('Escape');
    await ctx.close();
  });
});

describe('並べ替え', () => {
  it('ガント: グループの行を長押しして動かすと、中のタスクごと並びが変わる（一覧も同じ）', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'gantt');
    const before = await groupOrder(page);
    const i = before.indexOf('試作・評価');
    const j = before.indexOf('ボデー設計');
    assert.ok(i > j, before.join(','));
    const from = await center(page.locator('.gline[data-group-anchor]', { hasText: '試作・評価' }).locator('.gname'));
    const to = await page.locator('.gline[data-group-anchor]', { hasText: 'ボデー設計' }).locator('.gname').boundingBox();
    await touchDrag(page, from, { x: from.x, y: to.y + 2 }, { steps: 16 });
    const after = await groupOrder(page);
    assert.ok(after.indexOf('試作・評価') < after.indexOf('ボデー設計'), after.join(','));
    assert.equal(await page.locator('.sheet').count(), 0, '動かしたときはメニューを出さない');
    // ボデー設計のタスクはボデー設計の下に付いたまま
    const t = await ganttTitles(page);
    assert.ok(t.indexOf('図面の出図') >= 0);
    await tab(page, 'tasks');
    const heads = await page.$$eval('.pane:not(.out) .grow-head:not(.child) .name', (els) => els.map((e) => e.textContent));
    assert.ok(heads.indexOf('試作・評価') < heads.indexOf('ボデー設計'), heads.join(','));
    await ctx.close();
  });

  it('ガント: 車種の行を長押しして動かすと、車種の順番が変わる', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'gantt');
    assert.deepEqual((await vehicleOrder(page)).slice(0, 2), ['A車（新型SUV）', 'B車（改良）']);
    const from = await center(page.locator('.gline.gveh', { hasText: 'B車' }).locator('.gname'));
    const to = await page.locator('.gline.gveh', { hasText: 'A車' }).locator('.gname').boundingBox();
    await touchDrag(page, from, { x: from.x, y: to.y + 2 }, { steps: 18 });
    assert.deepEqual((await vehicleOrder(page)).slice(0, 2), ['B車（改良）', 'A車（新型SUV）']);
    const chips = await page.$$eval('.pane:not(.out) .chips .chip[data-sort-key] span', (els) => els.map((e) => e.textContent));
    assert.deepEqual(chips.slice(0, 2), ['B車（改良）', 'A車（新型SUV）'], '上のボタンも同じ順番');
    await ctx.close();
  });

  it('上の車種のボタン: 長押しして横に動かすと並び順が変わる。長押しして離すとメニュー', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    const chip = (t) => page.locator('.pane:not(.out) .chips .chip[data-sort-key]', { hasText: t });
    const from = await center(chip('B車'));
    const to = await chip('A車').boundingBox();
    await touchDrag(page, from, { x: to.x + 4, y: from.y }, { steps: 12 });
    const names = await page.$$eval('.pane:not(.out) .chips .chip[data-sort-key] span', (els) => els.map((e) => e.textContent));
    assert.deepEqual(names.slice(0, 2), ['B車（改良）', 'A車（新型SUV）']);
    assert.match(await page.locator('.toast').textContent(), /並び順を変えました/);
    assert.equal(await page.locator('.pane:not(.out) .vrow').first().locator('.ellipsis').textContent(), 'B車（改良）', '一覧の車種の順番も');
    const p = await center(chip('A車'));
    await touchDrag(page, p, p, { steps: 1 });
    assert.match(await sheet(page).locator('.sheet-head h2').textContent(), /A車/);
    assert.ok((await sheet(page).locator('.menu .item').allTextContents()).includes('名前・色を編集'));
    await ctx.close();
  });
});

describe('文字の入力', () => {
  it('キーボードの ✓（入力欄から離れる）で、打った文字を追加して閉じる。「×」は追加しない', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    await page.click('.quick .opener');
    await page.keyboard.type('チェックで追加');
    await page.evaluate(() => document.activeElement.blur());
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.compose.open').count(), 0, '閉じた');
    assert.ok((await listTitles(page)).includes('チェックで追加'), '追加された');
    await page.click('.quick .opener');
    await page.keyboard.type('やめたタスク');
    await page.click('.compose [aria-label="閉じる"]');
    await page.waitForTimeout(300);
    assert.ok(!(await listTitles(page)).includes('やめたタスク'));
    await page.click('.quick .opener');
    assert.equal(await page.inputValue('.compose .inp'), '', '前の文字は残らない');
    await ctx.close();
  });

  it('文字を打つとき、画面（ヘッダー・一覧・下のタブ）は動かない', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    const pos = () => page.evaluate(() => ({ head: document.querySelector('.top').getBoundingClientRect().top, nav: document.querySelector('.nav').getBoundingClientRect().top, app: document.querySelector('.app').getBoundingClientRect().height }));
    const a = await pos();
    await page.click('.quick .opener');
    await page.evaluate(async () => {
      const vh = window.visualViewport.height;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: vh + 340 });
      window.visualViewport.dispatchEvent(new Event('resize'));
      await new Promise((ok) => setTimeout(ok, 450));
    });
    assert.deepEqual(await pos(), a);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('kb-open')), true);
    await ctx.close();
  });
});

describe('報告から外す・完了したタスクの削除', () => {
  it('報告の行の × で「この報告から外す」。数字も数え直す。「タスクを削除」も選べる', async () => {
    const { ctx, page } = await open('iphone');
    await page.click('.top .rbtn');
    await page.waitForTimeout(500);
    const rep = sheet(page).locator('[data-testid="report"]');
    const total = async () => Number((await rep.locator('.kpi').nth(1).locator('.kv').textContent()).split('/')[1]);
    const n0 = await total();
    const first = rep.locator('.rsec', { hasText: '今後2週間の期限' }).locator('.rrow').first();
    const title = await first.locator('.rt').textContent();
    await first.locator('.rx').click();
    await page.waitForTimeout(300);
    const menu = sheet(page);
    assert.deepEqual(await menu.locator('.menu .item').allTextContents(), ['この報告から外す', 'タスクを削除して、報告からも外す']);
    await menu.locator('.menu .item', { hasText: 'この報告から外す' }).click();
    await page.waitForTimeout(400);
    assert.equal(await total(), n0 - 1);
    assert.ok(!(await rep.locator('.rt').allTextContents()).includes(title));
    await ctx.close();
  });

  it('設定: 完了したタスクをまとめて削除', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'settings');
    const btn = page.locator('.item', { hasText: '完了したタスクを削除' });
    assert.match(await btn.textContent(), /1件/);
    await btn.click();
    await sheet(page).locator('.btn.danger', { hasText: '削除する' }).click();
    await page.waitForTimeout(400);
    assert.match(await btn.textContent(), /0件/);
    await tab(page, 'tasks');
    assert.ok(!(await listTitles(page)).includes('構想図の確認'));
    await ctx.close();
  });
});

describe('大日程の今週', () => {
  it('今週は列ごと色を付け、日の位置の線は引かない。イベントがない車種でも空の行を足さない', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'plan');
    const r = await page.evaluate(() => {
      const col = document.querySelector('.plan .gbg .nowcol').getBoundingClientRect();
      const wk = document.querySelector('.pweek.now').getBoundingClientRect();
      return { line: document.querySelectorAll('.plan .gbg .now').length, left: col.left - wk.left, w: col.width - wk.width };
    });
    assert.equal(r.line, 0);
    assert.ok(Math.abs(r.left) < 1.5 && Math.abs(r.w) < 1.5, JSON.stringify(r));
    // 車種を追加して選ぶ（イベントなし）
    await tab(page, 'settings');
    await page.click('.item:has-text("車種を追加")');
    await page.waitForTimeout(300);
    await sheet(page).locator('.inp').first().fill('C車');
    await sheet(page).locator('.inp').first().press('Enter');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await tab(page, 'plan');
    await page.locator('.pane:not(.out) .chips .chip', { hasText: 'C車' }).click().catch(async () => {
      await page.locator('.pane:not(.out) .chips .chip', { hasText: '他' }).click();
      await sheet(page).locator('button', { hasText: 'C車' }).click();
    });
    await page.waitForTimeout(300);
    const h = await page.evaluate(() => {
      const card = document.querySelector('.gantt.plan').getBoundingClientRect();
      const last = [...document.querySelectorAll('.plan .gline')].pop().getBoundingClientRect();
      return card.bottom - last.bottom;
    });
    assert.ok(h <= 13, `最後の行の下 ${h}px`);
    await ctx.close();
  });
});

describe('エラー', () => {
  it('ブラウザのエラーが出ていない', () => assert.deepEqual(errors, []));
});

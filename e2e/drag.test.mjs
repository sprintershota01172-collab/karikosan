// 長押しドラッグの並べ替え（タッチ・マウス）、ガタつき（行ったり来たり）がないこと
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { errors, ganttTitles, listTitles, open, openGroup, saved, setup, tab, teardown, touchDrag } from './helpers.mjs';

before(setup);
after(teardown);

/** ドラッグ中に、ほかの行がどれだけずれているか（行ごとの transform の y） */
const shifts = (page, sel) =>
  page.$$eval(sel, (els) =>
    els.map((e) => {
      const m = /translate3d\(0(?:px)?, (-?[\d.]+)px/.exec(e.style.transform);
      return { key: e.dataset.sortKey, y: m ? Number(m[1]) : 0, lifted: e.classList.contains('lifted') };
    }),
  );

describe('タスクの並べ替え', () => {
  it('タッチ: 長押しで浮かせ、2つ下の行の間に入れる。途中で行が往復しない', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    const before = await listTitles(page);
    // フロント周りの子ツリー: 構想図の確認, バンパー形状の検討, ヘッドランプ取付検討, フード開閉の干渉確認
    const rowA = page.locator('.trow', { hasText: '構想図の確認' });
    const rowC = page.locator('.trow', { hasText: 'ヘッドランプ取付検討' });
    const a = await rowA.boundingBox();
    const c = await rowC.boundingBox();
    const samples = await touchDrag(page, { x: a.x + a.width / 2, y: a.y + a.height / 2 }, { x: a.x + a.width / 2, y: c.y + c.height * 0.75 }, { sample: () => shifts(page, '.trow[data-sort-key]') });
    // ずらされた行の数（= 挿入位置）が増える一方で、減らない
    const counts = samples.map((s) => s.filter((x) => !x.lifted && x.y !== 0).length);
    for (let i = 1; i < counts.length; i++) assert.ok(counts[i] >= counts[i - 1], `往復なし: ${counts.join(',')}`);
    assert.ok(samples.some((s) => s.some((x) => x.lifted)), 'つかんだ行だけが浮く');
    assert.equal(samples.flat().filter((x) => x.lifted).length > 0 && samples.every((s) => s.filter((x) => x.lifted).length <= 1), true, '同時に浮くのは1行だけ');
    const after1 = await listTitles(page);
    const i = after1.indexOf('構想図の確認');
    assert.equal(after1[i - 1], 'ヘッドランプ取付検討', `ヘッドランプの次に入る: ${after1.join(',')}`);
    assert.notDeepEqual(after1, before);
    // ドラッグ後に transform が残らない
    assert.ok((await shifts(page, '.trow[data-sort-key]')).every((x) => x.y === 0 && !x.lifted));
    // 再読み込みしても並びが残る
    await saved(page);
    await page.reload();
    await page.waitForSelector('.trow');
    assert.deepEqual(await listTitles(page), after1);
    await ctx.close();
  });

  it('タッチ: すぐに縦に動かしても、並べ替えにならず画面も動かない（縦スワイプなし）', async () => {
    const { ctx, page } = await open('se');
    await tab(page, 'tasks');
    const before = await listTitles(page);
    const top0 = await page.$eval('.pane:not(.out) .scroll', (e) => e.scrollTop);
    const r = await page.locator('.trow', { hasText: 'バンパー形状の検討' }).boundingBox();
    await touchDrag(page, { x: r.x + 100, y: r.y + 20 }, { x: r.x + 100, y: r.y - 150 }, { hold: 30 });
    await touchDrag(page, { x: r.x + 100, y: r.y + 20 }, { x: r.x + 100, y: r.y + 150 }, { hold: 30 });
    assert.deepEqual(await listTitles(page), before);
    assert.equal(await page.$eval('.pane:not(.out) .scroll', (e) => e.scrollTop), top0, '縦スワイプで一覧が動かない');
    await ctx.close();
  });

  it('マウス（PC）: 押して動かすと並べ替え。期限順のときは手動に切り替わる', async () => {
    const { ctx, page } = await open('pc');
    await tab(page, 'tasks');
    await page.click('.toolbar .chip:has-text("手動")');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.toolbar .chip:has-text("期限順")').count(), 1);
    await openGroup(page, '試作・評価');
    const due = await listTitles(page);
    const a = await page.locator('.trow', { hasText: '試作部品の手配' }).boundingBox();
    const b = await page.locator('.trow', { hasText: '衝突解析の依頼' }).boundingBox();
    await page.mouse.move(a.x + 200, a.y + a.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(a.x + 200, a.y + a.height / 2 + ((b.y - a.y + a.height * 0.3) * i) / 12);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(450);
    assert.equal(await page.locator('.toolbar .chip:has-text("手動")').count(), 1, '手動に切り替わる');
    assert.match(await page.locator('.toast').textContent(), /手動の並びに切り替えました/);
    const after1 = await listTitles(page);
    assert.notDeepEqual(after1, due);
    assert.ok(after1.indexOf('試作部品の手配') > after1.indexOf('衝突解析の依頼'));
    await ctx.close();
  });
});

describe('ガントの行の並べ替え', () => {
  it('名前の列を長押しで動かすと、名前とバーが同じ行で一緒に動き、一覧の順番も変わる', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'gantt');
    await openGroup(page, '試作・評価');
    const r1 = await page.locator('.gline', { hasText: '試作部品の手配' }).locator('.gname').boundingBox();
    const r3 = await page.locator('.gline', { hasText: '評価計画書の作成' }).locator('.gname').boundingBox();
    const samples = await touchDrag(page, { x: r1.x + 60, y: r1.y + r1.height / 2 }, { x: r1.x + 60, y: r3.y + r3.height * 0.8 }, {
      sample: () =>
        page.$eval('.gline.lifted', (row) => {
          const n = row.querySelector('.gname').getBoundingClientRect();
          const t = row.querySelector('.gtrack').getBoundingClientRect();
          return Math.abs(n.top - t.top);
        }).catch(() => 0),
    });
    assert.ok(samples.every((d) => d < 0.5), '名前とバーは縦にずれない');
    const g = await ganttTitles(page);
    assert.ok(g.indexOf('試作部品の手配') > g.indexOf('評価計画書の作成'), g.join(','));
    await tab(page, 'tasks');
    const l = await listTitles(page);
    assert.ok(l.indexOf('試作部品の手配') > l.indexOf('評価計画書の作成'), '一覧も同じ順');
    await ctx.close();
  });
});

describe('エラー', () => {
  it('ブラウザのエラーが出ていない', () => assert.deepEqual(errors, []));
});

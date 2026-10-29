// ガント: 20行表示、バーの移動・伸縮、土日、期限順の自動整列、一覧との同期
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { errors, ganttTitles, listTitles, open, setup, sheet, tab, teardown, touchDrag } from './helpers.mjs';

before(setup);
after(teardown);

const bar = (page, title) => page.locator('.gline', { hasText: title }).locator('.gbar');
const range = async (page, title) => {
  const b = bar(page, title);
  return { start: await b.getAttribute('data-start'), end: await b.getAttribute('data-end') };
};
const dayW = (page) => page.evaluate(() => 1.75 * parseFloat(getComputedStyle(document.documentElement).fontSize));
const wdays = (a, b) => {
  let n = 0;
  for (let t = Date.parse(a + 'T00:00:00Z'); t <= Date.parse(b + 'T00:00:00Z'); t += 86400000) {
    const w = new Date(t).getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
};
const isWE = (d) => [0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay());

async function mouseDrag(page, x, y, dx, steps = 10) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x + (dx * i) / steps, y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(450);
}

describe('表示', () => {
  for (const size of ['se', 'iphone', 'max', 'ipad', 'pc']) {
    it(`${size}: 1画面に20行入り、名前とバーの行が一致する`, async () => {
      const { ctx, page } = await open(size);
      await tab(page, 'gantt');
      const r = await page.evaluate(() => {
        const sc = document.querySelector('.gscroll');
        const head = document.querySelector('.ghead').getBoundingClientRect().height;
        const row = document.querySelector('.gline').getBoundingClientRect().height;
        return { fits: (sc.clientHeight - head) / row, pageScroll: document.scrollingElement.scrollHeight - innerHeight };
      });
      assert.ok(r.fits >= 19.5, `入る行数 ${r.fits.toFixed(1)}`);
      assert.ok(r.pageScroll <= 0, 'ページ全体はスクロールしない');
      await ctx.close();
    });
  }

  it('高速に縦スクロールしても、名前とバーが縦にずれない（同じ行の要素）', async () => {
    const { ctx, page } = await open('iphone');
    // 行を増やす（20行を超えて内部スクロールさせる）
    await tab(page, 'tasks');
    for (let i = 0; i < 12; i++) {
      await page.fill('.quick .inp', `追加タスク${i + 1}`);
      await page.press('.quick .inp', 'Enter');
    }
    await tab(page, 'gantt');
    const offs = await page.evaluate(async () => {
      const sc = document.querySelector('.gscroll');
      const out = [];
      for (let i = 0; i < 30; i++) {
        sc.scrollTop = (i % 2 ? sc.scrollHeight : 0) * Math.random();
        sc.scrollLeft = Math.random() * 300;
        await new Promise((r) => requestAnimationFrame(r));
        for (const row of document.querySelectorAll('.gline')) {
          const n = row.querySelector('.gname').getBoundingClientRect();
          const t = row.querySelector('.gtrack').getBoundingClientRect();
          out.push(Math.abs(n.top - t.top) + Math.abs(n.height - t.height));
        }
      }
      return Math.max(...out);
    });
    assert.ok(offs < 0.5, `ずれ ${offs}`);
    // 内部だけがスクロールする
    assert.ok(await page.evaluate(() => document.querySelector('.gscroll').scrollHeight > document.querySelector('.gscroll').clientHeight));
    await ctx.close();
  });
});

describe('バーの操作', () => {
  it('マウス: バー全体を動かすと期間が平行移動し、作業日数は変わらない（土日に入らない）', async () => {
    const { ctx, page } = await open('pc');
    await tab(page, 'gantt');
    const t = 'ヘッドランプ取付検討';
    const r0 = await range(page, t);
    const n0 = wdays(r0.start, r0.end);
    const b = await bar(page, t).boundingBox();
    const w = await dayW(page);
    await mouseDrag(page, b.x + Math.min(b.width / 2, w * 1.5), b.y + b.height / 2, w * 3);
    const r1 = await range(page, t);
    assert.notDeepEqual(r1, r0);
    assert.equal(wdays(r1.start, r1.end), n0, `作業日数 ${n0}`);
    assert.ok(!isWE(r1.start) && !isWE(r1.end), `${r1.start}〜${r1.end}`);
    // 一覧の編集画面にも反映
    await page.locator('.gline', { hasText: t }).locator('.gname').click();
    await page.locator('.gline', { hasText: t }).locator('.gname').click();
    await page.waitForTimeout(300);
    assert.equal(await sheet(page).locator('input[aria-label="期限"]').inputValue(), r1.end);
    await ctx.close();
  });

  it('マウス: 右端で期限、左端で開始日を変える。土日に落ちたら作業日に寄せる', async () => {
    const { ctx, page } = await open('pc');
    await tab(page, 'gantt');
    const t = '試作部品の手配';
    await page.locator('.gline', { hasText: t }).locator('.gname').click();
    const r0 = await range(page, t);
    const w = await dayW(page);
    let b = await bar(page, t).boundingBox();
    await mouseDrag(page, b.x + b.width - 2, b.y + b.height / 2, w * 4.2);
    const r1 = await range(page, t);
    assert.equal(r1.start, r0.start);
    assert.ok(r1.end > r0.end && !isWE(r1.end), `${r0.end} → ${r1.end}`);
    b = await bar(page, t).boundingBox();
    await mouseDrag(page, b.x + 2, b.y + b.height / 2, w * 1);
    const r2 = await range(page, t);
    assert.ok(r2.start > r1.start && !isWE(r2.start), `${r1.start} → ${r2.start}`);
    assert.equal(r2.end, r1.end);
    await ctx.close();
  });

  it('タッチ: 長押ししてから動かすとバーが動く。すぐ動かすと横スクロール', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'gantt');
    const t = 'テールランプ配置';
    const r0 = await range(page, t);
    const sc0 = await page.$eval('.gscroll', (e) => e.scrollLeft);
    let b = await bar(page, t).boundingBox();
    const w = await dayW(page);
    const x = Math.min(b.x + b.width / 2, 360);
    // すぐ動かす → スクロール（日付は変わらない）
    await touchDrag(page, { x, y: b.y + b.height / 2 }, { x: x - 80, y: b.y + b.height / 2 }, { hold: 20 });
    assert.deepEqual(await range(page, t), r0);
    assert.notEqual(await page.$eval('.gscroll', (e) => e.scrollLeft), sc0, '横スクロールした');
    // 長押し → 移動
    b = await bar(page, t).boundingBox();
    const x2 = Math.max(b.x + 10, 150);
    await touchDrag(page, { x: x2, y: b.y + b.height / 2 }, { x: x2 + w * 2, y: b.y + b.height / 2 }, { hold: 400 });
    const r1 = await range(page, t);
    assert.notDeepEqual(r1, r0);
    assert.equal(wdays(r1.start, r1.end), wdays(r0.start, r0.end));
    await ctx.close();
  });

  it('土日作業: オフは週末でバーを区切り、オンにすると土日もつながる', async () => {
    const { ctx, page } = await open('pc');
    await tab(page, 'gantt');
    const t = 'バンパー形状の検討';
    const runs0 = await bar(page, t).locator('.seg-run').count();
    assert.ok(runs0 >= 2, `週末で区切る: ${runs0}`);
    await page.locator('.gline', { hasText: t }).locator('.gname').click();
    await page.locator('.gline', { hasText: t }).locator('.gname').click();
    await sheet(page).locator('button[aria-label="土日も作業する"]').click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await bar(page, t).locator('.seg-run').count(), 1);
    // 土日作業ありなら、土曜に動かせる
    const w = await dayW(page);
    const r0 = await range(page, t);
    const b = await bar(page, t).boundingBox();
    const toSat = (6 - new Date(r0.start + 'T00:00:00Z').getUTCDay() + 7) % 7;
    await mouseDrag(page, b.x + w / 2, b.y + b.height / 2, w * toSat);
    const r1 = await range(page, t);
    assert.equal(new Date(r1.start + 'T00:00:00Z').getUTCDay(), 6, `土曜に開始: ${r1.start}`);
    await ctx.close();
  });

  it('期限順: バーで期限を変えると自動で並び直し、一覧も同じ順。並び替え後に行の transform が残らない', async () => {
    const { ctx, page } = await open('pc');
    await tab(page, 'gantt');
    await page.click('.toolbar .chip:has-text("手動")');
    await page.waitForTimeout(300);
    const before1 = await ganttTitles(page);
    // フロント周りの最後（フード開閉）を、いちばん早い期限にする
    const t = 'フード開閉の干渉確認';
    await page.locator('.gline', { hasText: t }).locator('.gname').click();
    const w = await dayW(page);
    const b = await bar(page, t).boundingBox();
    await mouseDrag(page, b.x + Math.min(b.width / 2, w), b.y + b.height / 2, -w * 16, 16);
    const after1 = await ganttTitles(page);
    assert.notDeepEqual(after1, before1);
    const group = ['構想図の確認', 'バンパー形状の検討', 'ヘッドランプ取付検討', 'フード開閉の干渉確認'];
    const order = after1.filter((x) => group.includes(x));
    assert.equal(order[0], t, order.join(','));
    await page.waitForTimeout(400);
    assert.ok(await page.$$eval('.gline', (els) => els.every((e) => !e.style.transform)), 'アニメーション後に transform が残らない');
    await tab(page, 'tasks');
    assert.deepEqual((await listTitles(page)).filter((x) => group.includes(x)), order);
    await ctx.close();
  });
});

describe('エラー', () => {
  it('ブラウザのエラーが出ていない', () => assert.deepEqual(errors, []));
});

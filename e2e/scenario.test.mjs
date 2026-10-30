// 重点シナリオ: 20件 → 連続で並べ替え → ガントで期限変更 → 期限順で自動整列 → 高速スクロール → 画面の連続切り替え → 再起動
// 20件すべてが並ぶように「グループは1つずつ開く」をオフにして全部開く
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { add, errors, ganttTitles, listTitles, open, openAllGroups, saved, setup, showRow, tab, teardown, touchDrag } from './helpers.mjs';

before(setup);
after(teardown);

describe('重点シナリオ（iPhone の画面サイズ・タッチ操作）', () => {
  it('ガントと一覧がずれず、ドラッグで振動せず、データが失われない', async () => {
    const { ctx, page } = await open('iphone');
    // 1. タスクを20件にする（サンプル15件 + 5件）
    await openAllGroups(page);
    await page.locator('.grow-head', { hasText: 'リア周り' }).click();
    for (let i = 1; i <= 5; i++) {
      await add(page, `追加${i}`);
    }
    assert.equal((await listTitles(page)).length, 20);
    await page.waitForTimeout(700); // 追加した行へのスクロールが終わるのを待つ

    // 2. 連続で並べ替え（毎回、ずらした行の数が単調に増えること = 往復しない）
    const sample = () => page.$$eval('.trow[data-sort-key]', (els) => els.filter((e) => !e.classList.contains('lifted') && e.style.transform && !/, 0px/.test(e.style.transform)).length);
    for (const [from, to] of [['追加1', '追加4'], ['追加5', 'テールランプ配置'], ['リアゲート構造の見直し', '追加3']]) {
      await showRow(page, page.locator('.trow', { hasText: from }));
      await showRow(page, page.locator('.trow', { hasText: to }));
      const a = await page.locator('.trow', { hasText: from }).boundingBox();
      const b = await page.locator('.trow', { hasText: to }).boundingBox();
      const down = b.y > a.y;
      await page.waitForTimeout(300);
      const s = await touchDrag(page, { x: a.x + 150, y: a.y + a.height / 2 }, { x: a.x + 150, y: down ? b.y + b.height * 0.8 : b.y + b.height * 0.2 }, { sample });
      for (let i = 1; i < s.length; i++) assert.ok(s[i] >= s[i - 1], `${from}→${to}: ${s.join(',')}`);
      const t = await listTitles(page);
      assert.ok(down ? t.indexOf(from) > t.indexOf(to) : t.indexOf(from) < t.indexOf(to), `${from} を ${to} の${down ? '下' : '上'}へ: ${t.join(',')}`);
    }
    const manual = await listTitles(page);

    // 3. ガントで期限を変える（長押しで移動）
    await tab(page, 'gantt');
    assert.deepEqual(await ganttTitles(page), manual, 'ガントと一覧は同じ順');
    const w = await page.evaluate(() => 1.75 * parseFloat(getComputedStyle(document.documentElement).fontSize));
    const bar = page.locator('.gline', { hasText: 'ヘッドランプ取付検討' }).locator('.gbar');
    await showRow(page, page.locator('.gline', { hasText: 'ヘッドランプ取付検討' }));
    const s0 = await bar.getAttribute('data-start');
    const bb = await bar.boundingBox();
    const x = Math.max(bb.x + 8, 160);
    await touchDrag(page, { x, y: bb.y + bb.height / 2 }, { x: x - w * 8, y: bb.y + bb.height / 2 }, { hold: 400 });
    assert.notEqual(await bar.getAttribute('data-start'), s0);

    // 4. 期限順で自動整列
    await page.click('.toolbar .chip[aria-label^="並び順"]');
    await page.waitForTimeout(400);
    const due = await ganttTitles(page);
    assert.notDeepEqual(due, manual);
    assert.ok(due.indexOf('ヘッドランプ取付検討') < due.indexOf('バンパー形状の検討'), '早くした期限が上へ');

    // 5. 高速スクロール（名前とバーがずれない）
    const drift = await page.evaluate(async () => {
      const sc = document.querySelector('.gscroll');
      let m = 0;
      for (let i = 0; i < 40; i++) {
        sc.scrollTop = Math.random() * sc.scrollHeight;
        await new Promise((r) => requestAnimationFrame(r));
        for (const row of document.querySelectorAll('.gline')) m = Math.max(m, Math.abs(row.querySelector('.gname').getBoundingClientRect().top - row.querySelector('.gtrack').getBoundingClientRect().top));
      }
      return m;
    });
    assert.ok(drift < 0.5, `ずれ ${drift}`);

    // 6. 画面の連続切り替え
    for (let i = 0; i < 12; i++) {
      await page.click(`nav button:nth-child(${(i % 6) + 1})`);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.main .pane').count(), 1);

    // 7. 再起動
    await tab(page, 'tasks');
    const beforeReload = await listTitles(page);
    assert.deepEqual(beforeReload, due, '一覧も期限順');
    await saved(page);
    await page.reload();
    await page.waitForSelector('nav');
    await tab(page, 'tasks');
    // 8. 保存状態と並び
    assert.deepEqual(await listTitles(page), beforeReload);
    assert.equal(await page.locator('.toolbar .chip[aria-label="並び順: 期限順"]').count(), 1);
    await tab(page, 'gantt');
    assert.deepEqual(await ganttTitles(page), beforeReload);
    assert.ok(await page.$$eval('[data-sort-key]', (els) => els.every((e) => !e.style.transform)));
    await ctx.close();
  });
});

describe('エラー', () => {
  it('ブラウザのエラーが出ていない', () => assert.deepEqual(errors, []));
});

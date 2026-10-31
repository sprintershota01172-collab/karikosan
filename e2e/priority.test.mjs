// 優先度: 印の表示（一覧・ガント）、ホームと「優先度別」の区切り、編集画面の理由、手動の上書き、絞り込み
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { errors, ganttTitles, listTitles, open, setup, sheet, tab, teardown } from './helpers.mjs';

before(setup);
after(teardown);

const RANK = { 至急: 4, 高: 3, 中: 2, 低: 1, 急: 4 };
const badges = (page, rows) => page.$$eval(rows, (els) => els.map((e) => e.querySelector('.pri')?.textContent ?? ''));
const nonIncreasing = (xs) => xs.every((x, i) => i === 0 || RANK[xs[i - 1]] >= RANK[x]);

describe('優先度', () => {
  it('一覧・ガントに印が出る。ホームは優先度ごとに区切って高い順', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    // 至急のタスク（曜日によってサンプルの日付がずれるので、至急になっているものを1つ選ぶ）
    const urgent = await page.$$eval('.trow', (els) => els.filter((e) => e.querySelector('.pri')?.textContent === '至急').map((e) => e.querySelector('.reveal > span').textContent));
    assert.ok(urgent.length > 0, '至急のタスクがある');
    assert.equal(await page.locator('.trow', { hasText: '原価の見積もり' }).locator('.pri').textContent(), '高', '手動の「高」');
    await tab(page, 'gantt');
    assert.equal(await page.locator('.gline', { hasText: urgent[0] }).locator('.pri').textContent(), '急');
    await tab(page, 'home');
    const heads = await page.$$eval('.pane:not(.out) .prow .ptag', (els) => els.map((e) => e.textContent));
    assert.ok(heads.length >= 2, heads.join(','));
    assert.ok(nonIncreasing(heads), `高い順: ${heads.join(',')}`);
    assert.equal(new Set(heads).size, heads.length, '同じ優先度の見出しは1つ');
    await ctx.close();
  });

  it('編集画面: 自動の理由が分かる。手動で変えると印が変わり、「自動」に戻せる', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    const row = page.locator('.trow', { hasText: '図面の出図' });
    const auto = await row.locator('.pri').textContent();
    await row.click();
    await row.click();
    await page.waitForTimeout(400);
    const why = sheet(page).locator('[data-testid="priority-why"]');
    assert.match(await why.textContent(), /自動: 期限まで作業日\d+日.*余裕/);
    await sheet(page).locator('.seg[aria-label="優先度"] button', { hasText: /^低$/ }).click();
    await page.waitForTimeout(200);
    assert.match(await why.textContent(), /手動で「低」/);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await row.locator('.pri').textContent(), '低');
    await row.click();
    await page.waitForTimeout(400);
    await sheet(page).locator('.seg[aria-label="優先度"] button', { hasText: /^自動$/ }).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await row.locator('.pri').textContent(), auto);
    await ctx.close();
  });

  it('並び順のボタン: 手動 → 期限順 → 優先度別。優先度別は 至急・高・中・低・完了 の見出しに分かれ、ガントも同じ', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    const chip = page.locator('.toolbar .chip[aria-label^="並び順"]');
    await chip.click();
    await page.waitForTimeout(250);
    assert.equal(await chip.getAttribute('aria-label'), '並び順: 期限順');
    await chip.click();
    await page.waitForTimeout(450);
    assert.equal(await chip.getAttribute('aria-label'), '並び順: 優先度別');
    assert.match(await page.locator('.toast').textContent(), /優先度ごとに分けました/);
    // 見出しは 至急 → 高 → 中 → 低 → 完了 の順。グループ（ボデー設計など）の見出しは出ない
    const heads = await page.$$eval('.pane:not(.out) .prow .ptag', (els) => els.map((e) => e.textContent));
    const ORDER = ['至急', '高', '中', '低', '完了'];
    assert.deepEqual(heads, ORDER.filter((x) => heads.includes(x)), heads.join(','));
    assert.ok(heads.length >= 3);
    assert.equal(await page.locator('.pane:not(.out) .grow-head').count(), 0);
    const list = await listTitles(page);
    assert.ok(list.includes('バンパー形状の検討') && list.includes('金型日程の調整'), '閉じているグループのタスクも並ぶ');
    // ガント: 同じ並び。各タスクの印が、その見出しの優先度と同じ
    await tab(page, 'gantt');
    assert.deepEqual(await ganttTitles(page), list);
    const bad = await page.$$eval('.pane:not(.out) .gline', (els) => {
      const out = [];
      let cur = '';
      for (const e of els) {
        const tag = e.querySelector('.ptag');
        if (tag) cur = tag.textContent;
        else if (e.dataset.sortKey) {
          const b = e.querySelector('.pri')?.textContent ?? '';
          const want = { 至急: '急', 高: '高', 中: '中', 低: '低', 完了: '' }[cur];
          if (b !== want) out.push(`${e.textContent} ${cur}/${b}`);
        }
      }
      return out;
    });
    assert.deepEqual(bad, []);
    await tab(page, 'tasks');
    await chip.click();
    await page.waitForTimeout(250);
    assert.equal(await chip.getAttribute('aria-label'), '並び順: 手動');
    await ctx.close();
  });

  it('絞り込み「至急・高」', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    await page.click('.toolbar .chip:has-text("絞り込み")');
    await page.waitForTimeout(300);
    await sheet(page).locator('.chip', { hasText: '至急・高' }).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const b = await badges(page, '.pane:not(.out) .trow[data-sort-key]');
    assert.ok(b.length > 0 && b.every((x) => x === '至急' || x === '高'), b.join(','));
    await ctx.close();
  });
});

describe('エラー', () => {
  it('ブラウザのエラーが出ていない', () => assert.deepEqual(errors, []));
});

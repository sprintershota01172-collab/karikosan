// 優先度: 印の表示（一覧・ガント・ホーム）、編集画面の理由、手動の上書き、優先順、絞り込み
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { errors, listTitles, open, setup, sheet, tab, teardown } from './helpers.mjs';

before(setup);
after(teardown);

const RANK = { 至急: 4, 高: 3, 中: 2, 低: 1, 急: 4 };
const badges = (page, rows) => page.$$eval(rows, (els) => els.map((e) => e.querySelector('.pri')?.textContent ?? ''));
const nonIncreasing = (xs) => xs.every((x, i) => i === 0 || RANK[xs[i - 1]] >= RANK[x]);

describe('優先度', () => {
  it('一覧・ガント・ホームに印が出る。ホームは優先度の高い順', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    assert.equal(await page.locator('.trow', { hasText: '週報の提出' }).locator('.pri').textContent(), '至急', '今日が期限 = 至急');
    assert.equal(await page.locator('.trow', { hasText: '原価の見積もり' }).locator('.pri').textContent(), '高', '手動の「高」');
    await tab(page, 'gantt');
    assert.equal(await page.locator('.gline', { hasText: '週報の提出' }).locator('.pri').textContent(), '急');
    await tab(page, 'home');
    const b = await badges(page, '.pane:not(.out) .swipe');
    assert.ok(b.length >= 3 && b.every(Boolean), b.join(','));
    assert.ok(nonIncreasing(b), `高い順: ${b.join(',')}`);
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

  it('並び順のボタン: 手動 → 期限順 → 優先順。優先順は 至急 → 高 → 中 → 低', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    const chip = page.locator('.toolbar .chip[aria-label^="並び順"]');
    await chip.click();
    await page.waitForTimeout(250);
    assert.equal(await chip.getAttribute('aria-label'), '並び順: 期限順');
    await chip.click();
    await page.waitForTimeout(450);
    assert.equal(await chip.getAttribute('aria-label'), '並び順: 優先順');
    assert.match(await page.locator('.toast').textContent(), /優先度の高い順/);
    // フロント周りの中（同じグループの中で並ぶ）
    const group = ['構想図の確認', 'バンパー形状の検討', 'ヘッドランプ取付検討', 'フード開閉の干渉確認'];
    const order = (await listTitles(page)).filter((x) => group.includes(x));
    const b = [];
    for (const t of order) b.push((await page.locator('.trow', { hasText: t }).locator('.pri').textContent().catch(() => '')) || '');
    assert.ok(nonIncreasing(b.filter(Boolean)), `${order.join(',')} / ${b.join(',')}`);
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

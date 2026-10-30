// ホーム: 今日／4分割（優先度・グループ）
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { errors, layoutReport, open, setup, sheet, tab, teardown } from './helpers.mjs';

before(setup);
after(teardown);

const titles = (page, i) => page.$$eval(`.quad-cell:nth-child(${i}) .qrow .reveal > span`, (els) => els.map((e) => e.textContent));

describe('ホーム', () => {
  it('見出しはあいさつではなく「ホーム」と日付', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'home');
    const h = await page.textContent('.top h1');
    assert.match(h, /^ホーム/);
    assert.doesNotMatch(h, /おはよう|こんにちは|おつかれ|お疲れ/);
    await ctx.close();
  });

  it('4分割（優先度）: 至急・高・中・低に分かれ、枠の＋で追加するとその枠に入る。設定は再読み込み後も残る', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'home');
    await page.click('.seg[aria-label="ホームの表示"] button:has-text("4分割")');
    await page.waitForTimeout(250);
    const heads = await page.$$eval('.quad-cell .qtag', (els) => els.map((e) => e.textContent));
    assert.deepEqual(heads, ['至急', '高', '中', '低']);
    assert.ok((await titles(page, 1)).includes('週報の提出'));
    await page.click('.quad-cell:nth-child(1) button[aria-label="至急に追加"]');
    await page.fill('.compose .inp', '至急の電話');
    await page.press('.compose .inp', 'Enter');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.ok((await titles(page, 1)).includes('至急の電話'));
    const r = await layoutReport(page);
    assert.ok(r.pageScroll <= 0 && r.wide.length === 0, JSON.stringify(r.wide));
    await page.reload();
    await page.waitForSelector('nav');
    await tab(page, 'home');
    assert.equal(await page.locator('.quad').count(), 1, '4分割のまま');
    await ctx.close();
  });

  it('4分割（グループ）: 上のグループで自動で埋まり、枠の名前を押すとグループを選べる。＋でそのグループに追加', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'home');
    await page.click('.seg[aria-label="ホームの表示"] button:has-text("4分割")');
    await page.click('.seg[aria-label="4分割の分け方"] button:has-text("グループ")');
    await page.waitForTimeout(250);
    let heads = await page.$$eval('.quad-cell .qtag', (els) => els.map((e) => e.textContent));
    assert.deepEqual(heads.slice(0, 3), ['ボデー設計', '試作・評価', '金型']);
    assert.ok((await titles(page, 1)).includes('バンパー形状の検討'), '子ツリーのタスクも入る');
    // 4つ目の枠に「リア周り」（子ツリー）を選ぶ
    await page.click('.quad-cell:nth-child(4) .qtag');
    await sheet(page).locator('.item', { hasText: 'リア周り' }).click();
    await page.waitForTimeout(300);
    heads = await page.$$eval('.quad-cell .qtag', (els) => els.map((e) => e.textContent));
    assert.equal(heads[3], 'リア周り');
    assert.deepEqual((await titles(page, 4)).sort(), ['テールランプ配置', 'リアゲート構造の見直し'].sort());
    await page.click('.quad-cell:nth-child(4) button[aria-label="リア周りに追加"]');
    await page.fill('.compose .inp', 'バックドア確認');
    await page.press('.compose .inp', 'Enter');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.ok((await titles(page, 4)).includes('バックドア確認'));
    // 一覧でもリア周りに入っている
    await tab(page, 'tasks');
    await page.locator('.grow-head', { hasText: 'リア周り' }).click();
    await page.waitForTimeout(300);
    assert.ok(await page.locator('.trow', { hasText: 'バックドア確認' }).isVisible());
    await ctx.close();
  });

  it('文字を大きくしても4分割がはみ出さない', async () => {
    const { ctx, page } = await open('se');
    await tab(page, 'settings');
    await page.$eval('input[aria-label="文字の大きさ"]', (e) => {
      e.value = '10';
      e.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await tab(page, 'home');
    await page.click('.seg[aria-label="ホームの表示"] button:has-text("4分割")');
    for (const by of ['優先度', 'グループ']) {
      await page.click(`.seg[aria-label="4分割の分け方"] button:has-text("${by}")`);
      await page.waitForTimeout(250);
      const r = await layoutReport(page);
      assert.ok(r.pageScroll <= 0 && r.wide.length === 0, `${by} ${JSON.stringify(r.wide)}`);
    }
    await ctx.close();
  });
});

describe('エラー', () => {
  it('ブラウザのエラーが出ていない', () => assert.deepEqual(errors, []));
});

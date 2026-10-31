// 状況報告: ワンタップで作成・同じ日は取り直し・課題の引き継ぎ（前回の課題）・履歴・Excel の出力
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';
import JSZip from 'jszip';
import { errors, open, setup, sheet, tab, teardown } from './helpers.mjs';

before(setup);
after(teardown);

/** ダウンロードのファイル名（a.download）を記録する（この環境の Chromium は blob のファイル名を返さないため） */
const watchName = (page) =>
  page.evaluate(() => {
    const o = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      window.__dlName = this.download;
      return o.call(this);
    };
  });
const sheetNames = async (path) => {
  const zip = await JSZip.loadAsync(await readFile(path));
  const wb = await zip.file('xl/workbook.xml').async('string');
  return { zip, names: [...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]) };
};

describe('状況報告', () => {
  it('ホームに進捗・遅れ・7日以内が出て、「報告書」をワンタップで作成。数字はホームと同じ', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'home');
    const st = await page.locator('[data-testid="status"]').textContent();
    const prog = st.match(/進捗(\d+)%/)?.[1];
    assert.ok(prog != null, st);
    await page.click('[data-testid="status"] .st-btn');
    await page.waitForTimeout(500);
    const rep = sheet(page).locator('[data-testid="report"]');
    assert.equal(await rep.count(), 1);
    assert.match(await page.locator('.toast').textContent(), /報告書を作成しました/);
    const kpi = await rep.locator('.kpi').first().textContent();
    assert.match(kpi, new RegExp(`進捗${prog}%`));
    for (const h of ['遅れ', '今後2週間の期限', '課題', '所感・連絡事項']) assert.ok((await rep.textContent()).includes(h), h);
    await ctx.close();
  });

  it('どの画面からも上の「報告」で作れる。同じ日にもう一度押すと最新の状況に取り直し、課題と所感は残る', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'gantt');
    await page.click('.top .rbtn');
    await page.waitForTimeout(500);
    const add = sheet(page).locator('input[aria-label="課題を追加"]');
    await add.fill('金型の発注が遅れている');
    await add.press('Enter');
    await page.waitForTimeout(200);
    const note = sheet(page).locator('.report textarea');
    await note.fill('来週の評価会で再確認します');
    await note.blur();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.click('.top .rbtn');
    await page.waitForTimeout(500);
    assert.match(await page.locator('.toast').textContent(), /最新の状況に更新/);
    assert.equal(await sheet(page).locator('input[aria-label="課題: 金型の発注が遅れている"]').count(), 1);
    assert.equal(await sheet(page).locator('.report textarea').inputValue(), '来週の評価会で再確認します');
    await sheet(page).locator('[aria-label="報告の履歴"]').click();
    await page.waitForTimeout(400);
    assert.equal(await sheet(page).locator('.hrow').count(), 1, '同じ日は1件');
    await ctx.close();
  });

  it('次の報告では、前回の対応中の課題を「前回の課題」として引き継ぎ、解決にできる。履歴から過去の報告を開ける', async () => {
    const { ctx, page } = await open('iphone');
    await page.clock.setFixedTime(new Date('2026-10-26T10:00:00+09:00'));
    await page.click('.top .rbtn');
    await page.waitForTimeout(500);
    const add = sheet(page).locator('input[aria-label="課題を追加"]');
    for (const t of ['試作部品の納期', '評価の部屋の予約']) {
      await add.fill(t);
      await add.press('Enter');
      await page.waitForTimeout(150);
    }
    // 2つ目は解決
    await sheet(page).locator('.irow:has(input[aria-label="課題: 評価の部屋の予約"]) .istate').click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    // 1週間後
    await page.clock.setFixedTime(new Date('2026-11-02T10:00:00+09:00'));
    await page.click('.top .rbtn');
    await page.waitForTimeout(500);
    assert.match(await page.locator('.toast').textContent(), /報告書を作成しました/);
    const prev = sheet(page).locator('.rsec', { hasText: '前回の課題' });
    assert.equal(await prev.count(), 1);
    const items = await prev.locator('.irow').allTextContents();
    assert.equal(items.length, 2);
    assert.match(items[0], /対応中.*試作部品の納期/);
    assert.match(items[1], /解決.*評価の部屋の予約/);
    assert.match(await sheet(page).locator('.rmeta').textContent(), /前回 10\/26/);
    assert.match(await sheet(page).locator('.kpi').first().textContent(), /[+−±]\d+pt/, '前回比');
    // 引き継いだ課題を解決にする
    await prev.locator('.irow', { hasText: '試作部品の納期' }).locator('.istate').click();
    await page.waitForTimeout(200);
    assert.match(await prev.locator('.irow').first().textContent(), /解決/);
    // 履歴: 2件。古い報告を開くと、そのときの課題が対応中のまま
    await sheet(page).locator('[aria-label="報告の履歴"]').click();
    await page.waitForTimeout(400);
    const rows = sheet(page).locator('.hrow');
    assert.equal(await rows.count(), 2);
    assert.match(await rows.nth(0).textContent(), /11\/2/);
    await rows.nth(1).click();
    await page.waitForTimeout(400);
    assert.match(await sheet(page).locator('.rmeta').textContent(), /10\/26/);
    assert.match(await sheet(page).locator('.irow:has(input[aria-label="課題: 試作部品の納期"]) .istate').textContent(), /対応中/);
    await ctx.close();
  });

  it('Excel で出力: 報告書・ガント・状況一覧・報告の履歴・大日程のシート。課題も入る', async () => {
    const { ctx, page } = await open('pc');
    await page.click('.top .rbtn');
    await page.waitForTimeout(500);
    const add = sheet(page).locator('input[aria-label="課題を追加"]');
    await add.fill('部品の納期を確認する');
    await add.press('Enter');
    await page.waitForTimeout(200);
    await watchName(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), sheet(page).locator('.sheet-foot .btn.primary', { hasText: 'Excel' }).click()]);
    assert.match(await page.evaluate(() => window.__dlName), /^状況報告_すべて_\d{8}\.xlsx$/);
    const path = await dl.path();
    const { zip, names } = await sheetNames(path);
    assert.deepEqual(names, ['報告書', 'ガント', '状況一覧', '報告の履歴', '大日程']);
    assert.match(await zip.file('xl/worksheets/sheet1.xml').async('string'), /部品の納期を確認する/);
    await ctx.close();
  });

  it('ガントの画面から Excel（ガント・状況一覧・大日程）。選んでいる車種だけ', async () => {
    const { ctx, page } = await open('pc');
    await tab(page, 'gantt');
    await page.locator('.chips .chip', { hasText: 'B車' }).first().click();
    await page.waitForTimeout(300);
    await watchName(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.toolbar [aria-label="Excel に出力"]')]);
    assert.match(await page.evaluate(() => window.__dlName), /^ガント_B車（改良）_\d{8}\.xlsx$/);
    const { zip, names } = await sheetNames(await dl.path());
    assert.deepEqual(names, ['ガント', '状況一覧', '大日程']);
    const g = await zip.file('xl/worksheets/sheet1.xml').async('string');
    assert.match(g, /原価の見積もり/);
    assert.ok(!g.includes('図面の出図'), 'A車のタスクは入らない');
    await ctx.close();
  });
});

describe('エラー', () => {
  it('ブラウザのエラーが出ていない', () => assert.deepEqual(errors, []));
});

// 画面の確認用スクリーンショット（テストではない）: SP=保存先 node e2e/_shot.mjs
import { open, setup, teardown, tab } from './helpers.mjs';
const SP = process.env.SP;
await setup();
{
  const { ctx, page } = await open('iphone');
  for (const t of ['home', 'tasks', 'gantt']) {
    await tab(page, t);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SP}/n-${t}.png` });
  }
  await tab(page, 'tasks');
  await page.locator('.trow', { hasText: 'バンパー形状' }).click();
  await page.locator('.trow', { hasText: 'バンパー形状' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SP}/n-sheet.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // グループを開く（ほかが閉じる）
  await page.locator('.grow-head', { hasText: '試作・評価' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SP}/n-tasks-open2.png` });
  await ctx.close();
}
{
  const { ctx, page } = await open('se');
  await page.$eval('input[aria-label="文字の大きさ"]', (e) => { e.value = '8'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  for (const t of ['tasks', 'gantt', 'settings']) { await tab(page, t); await page.waitForTimeout(400); await page.screenshot({ path: `${SP}/n-se-${t}.png` }); }
  await ctx.close();
}
await teardown();

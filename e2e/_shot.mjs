// 画面の確認用スクリーンショット（テストではない）: SP=保存先 node e2e/_shot.mjs
import { open, setup, teardown, tab } from './helpers.mjs';
const SP = process.env.SP;
await setup();
{
  const { ctx, page } = await open('iphone');
  await page.waitForTimeout(5200); // 「サンプルを入れました」が消えるまで
  for (const t of ['home', 'tasks', 'gantt', 'calendar', 'settings']) {
    await tab(page, t);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SP}/f-${t}.png` });
  }
  await tab(page, 'tasks');
  await page.click('.toolbar .chip[aria-label^="並び順"]');
  await page.click('.toolbar .chip[aria-label^="並び順"]');
  await page.waitForTimeout(5200);
  await page.screenshot({ path: `${SP}/f-tasks-prio.png` });
  await tab(page, 'gantt');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SP}/f-gantt-prio.png` });
  await tab(page, 'tasks');
  const row = page.locator('.trow', { hasText: 'テールランプ配置' });
  await row.click();
  await row.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SP}/f-sheet.png` });
  await ctx.close();
}
await teardown();

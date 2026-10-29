import { open, setup, teardown, tab } from './helpers.mjs';
const SP = process.env.SP;
await setup();
{
  const { ctx, page } = await open('pc');
  for (const t of ['tasks', 'gantt']) { await tab(page, t); await page.screenshot({ path: `${SP}/k-pc-${t}.png` }); }
  await ctx.close();
}
{
  const { ctx, page } = await open('se');
  await page.$eval('input[aria-label="文字の大きさ"]', (e) => { e.value = '10'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  for (const t of ['tasks', 'gantt', 'home']) { await tab(page, t); await page.screenshot({ path: `${SP}/k-big-${t}.png` }); }
  await ctx.close();
}
await teardown();

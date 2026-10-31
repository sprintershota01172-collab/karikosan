// 大項目の折りたたみ・並び順、タスクがないときのガント、オフライン表示、ホームの4分割（枠タップ・名前・一覧で見る）、車種の連動、見た目
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { errors, ganttTitles, listTitles, open, setup, sheet, tab, teardown } from './helpers.mjs';

before(setup);
after(teardown);

const quadTitles = (page, i) => page.$$eval(`.quad-cell:nth-child(${i}) .qrow .reveal > span`, (els) => els.map((e) => e.textContent));

describe('ガントの大項目（車種）', () => {
  it('車種の行をタップすると折りたたみ、期間のまとめのバーが出る。一覧も同じ。もう一度で開く', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'gantt');
    const all = await ganttTitles(page);
    assert.ok(all.includes('原価の見積もり'));
    const row = page.locator('.gline.gveh', { hasText: 'B車' });
    await row.click();
    await page.waitForTimeout(350);
    assert.equal(await row.getAttribute('aria-expanded'), 'false');
    assert.ok(!(await ganttTitles(page)).includes('原価の見積もり'), 'B車の中身が隠れる');
    assert.equal(await row.locator('.gsum').count(), 1, 'まとめのバー');
    await tab(page, 'tasks');
    assert.ok(!(await listTitles(page)).includes('原価の見積もり'), '一覧も同じ');
    await page.locator('.vrow', { hasText: 'B車' }).click();
    await page.waitForTimeout(300);
    assert.ok((await listTitles(page)).includes('原価の見積もり'), '一覧でも開ける');
    await ctx.close();
  });

  it('並び順の画面: 車種とグループの順番を変えると、ガントと一覧の順番が変わる。すべて閉じる・開く', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'gantt');
    await page.click('button[aria-label="大項目の並び順"]');
    await page.waitForTimeout(350);
    const s = sheet(page);
    await s.locator('button[aria-label="B車（改良）を上へ"]').click();
    await s.locator('button[aria-label="試作・評価を上へ"]').click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    const vs = await page.$$eval('.gline.gveh .reveal > span', (els) => els.map((e) => e.textContent));
    assert.deepEqual(vs.slice(0, 2), ['B車（改良）', 'A車（新型SUV）']);
    const gs = await page.$$eval('.gline[data-level="1"] .reveal > span', (els) => els.map((e) => e.textContent));
    assert.ok(gs.indexOf('試作・評価') < gs.indexOf('ボデー設計'), gs.join(','));
    await page.click('button[aria-label="大項目の並び順"]');
    await page.waitForTimeout(350);
    await sheet(page).locator('button', { hasText: 'すべて閉じる' }).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    assert.equal((await ganttTitles(page)).length, 0, 'すべて閉じた');
    await ctx.close();
  });

  it('タスクがないとき、名前の列に日付の線が入り込まず、格子は下まで続く（日・週・月）', async () => {
    const { ctx, page } = await open('iphone', { sample: false });
    await tab(page, 'gantt');
    for (const z of ['日', '週', '月']) {
      await page.locator('.seg[aria-label="表示の単位"] button', { hasText: z }).click();
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => {
        const sc = document.querySelector('.gscroll');
        sc.scrollLeft = sc.scrollWidth / 3;
        const corner = document.querySelector('.gcorner').getBoundingClientRect();
        const box = sc.getBoundingClientRect();
        // 名前の列の地（不透明）が、名前の列の幅で下まで覆っている（日付の線より上の重なり）
        const col = document.querySelector('.gnamecol');
        const c = col.getBoundingClientRect();
        const bad = [];
        if (Math.abs(c.left - corner.left) > 1 || Math.abs(c.right - corner.right) > 1) bad.push(`幅 ${c.left}-${c.right} / ${corner.left}-${corner.right}`);
        if (c.bottom < box.bottom - 2) bad.push(`下まで ${c.bottom} / ${box.bottom}`);
        if (Number(getComputedStyle(col).zIndex) <= Number(getComputedStyle(document.querySelector('.gbg')).zIndex)) bad.push('重なり順');
        if (getComputedStyle(col).backgroundColor === 'rgba(0, 0, 0, 0)') bad.push('透明');
        const body = document.querySelector('.gbody').getBoundingClientRect();
        return { bad, fill: body.bottom >= box.bottom - 2 };
      });
      assert.deepEqual(r.bad, [], z);
      assert.ok(r.fill, `格子が下まで: ${z}`);
    }
    await ctx.close();
  });
});

describe('オフライン', () => {
  it('電波がないと「オフライン」と出る。設定でオフラインの準備ができていると分かる', async () => {
    const { ctx, page } = await open('iphone');
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 10000 }).catch(() => undefined);
    await tab(page, 'settings');
    await page.waitForTimeout(400);
    assert.match(await page.textContent('.pane:not(.out)'), /オフラインでも使えます/);
    await ctx.setOffline(true);
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.top .offline').count(), 1);
    await ctx.setOffline(false);
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.top .offline').count(), 0);
    await ctx.close();
  });
});

describe('ホームの4分割', () => {
  it('枠の空いている所をタップすると、その枠に追加する入力欄が出る', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'home');
    await page.click('.seg[aria-label="ホームの表示"] button:has-text("4分割")');
    await page.waitForTimeout(250);
    await page.locator('.quad-cell:nth-child(4) .qempty').click();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.compose.open').count(), 1);
    assert.match(await page.textContent('.compose-hint'), /低/);
    await page.fill('.compose .inp', 'あとで読む資料');
    await page.press('.compose .inp', 'Enter');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.ok((await quadTitles(page, 4)).includes('あとで読む資料'));
    await ctx.close();
  });

  it('枠の名前を変えられる（空にすると自動の名前）。「タスクの一覧で見る」で一覧へ', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'home');
    await page.click('.seg[aria-label="ホームの表示"] button:has-text("4分割")');
    await page.waitForTimeout(250);
    await page.click('.quad-cell:nth-child(1) .qtag');
    await page.waitForTimeout(300);
    const inp = sheet(page).locator('input.inp').first();
    await inp.fill('今日やる');
    await inp.press('Enter');
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await page.textContent('.quad-cell:nth-child(1) .qtag'), '今日やる');
    // 一覧で見る（優先度 → タスクの「優先度別」）
    await page.click('.quad-cell:nth-child(1) .qtag');
    await page.waitForTimeout(300);
    await sheet(page).locator('button', { hasText: 'タスクの一覧で見る' }).click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('nav button[aria-current="page"]').textContent(), 'タスク');
    assert.equal(await page.locator('.toolbar .chip[aria-label^="並び順"]').getAttribute('aria-label'), '並び順: 優先度別');
    // 名前を空に戻す → 自動
    await tab(page, 'home');
    await page.click('.quad-cell:nth-child(1) .qtag');
    await page.waitForTimeout(300);
    await sheet(page).locator('input.inp').first().fill('');
    await sheet(page).locator('input.inp').first().press('Enter');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await page.textContent('.quad-cell:nth-child(1) .qtag'), '至急');
    await ctx.close();
  });

  it('ホームとタスクは連動: 車種の選択が共通で、ホームの中身も絞られる', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    await page.click('.pane:not(.out) .chips .chip:has-text("B車")');
    await tab(page, 'home');
    assert.equal(await page.locator('.pane:not(.out) .chips .chip[aria-pressed="true"]').textContent(), 'B車（改良）');
    const titles = await page.$$eval('.pane:not(.out) .swipe .reveal > span', (els) => els.map((e) => e.textContent));
    assert.ok(titles.length > 0 && titles.every((t) => ['型構想の打ち合わせ準備', '金型日程の調整', 'トライ結果のまとめ', '原価の見積もり'].includes(t)), titles.join(','));
    await page.click('.seg[aria-label="ホームの表示"] button:has-text("4分割")');
    await page.waitForTimeout(250);
    const q = (await Promise.all([1, 2, 3, 4].map((i) => quadTitles(page, i)))).flat();
    assert.ok(q.length > 0 && !q.includes('バンパー形状の検討'), q.join(','));
    await ctx.close();
  });
});

describe('見た目', () => {
  it('文字はビジネス向けの角ゴシック、画面の切り替えは中央からふわっと、同じまとまりの行はすき間なくつながる', async () => {
    const { ctx, page } = await open('iphone');
    const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    assert.match(font, /Hiragino Sans/);
    assert.doesNotMatch(font, /Maru|rounded/i);
    await page.click('nav button:nth-child(2)');
    await page.waitForTimeout(30);
    const anim = await page.$eval('.main .pane.in', (e) => ({ name: getComputedStyle(e).animationName, origin: getComputedStyle(e).transformOrigin }));
    assert.equal(anim.name, 'pane-in');
    await page.waitForTimeout(400);
    const gaps = await page.$$eval('.pane:not(.out) .swipe', (els) => {
      const out = [];
      for (let i = 1; i < els.length; i++) {
        if (els[i - 1].classList.contains('last')) continue;
        out.push(Math.round(els[i].getBoundingClientRect().top - els[i - 1].getBoundingClientRect().bottom));
      }
      return out;
    });
    assert.ok(gaps.length > 2 && gaps.every((g) => g === 0), gaps.join(','));
    await ctx.close();
  });
});

describe('エラー', () => {
  it('ブラウザのエラーが出ていない', () => assert.deepEqual(errors, []));
});

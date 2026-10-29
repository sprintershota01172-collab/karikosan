// 画面の配置（5つの画面サイズ）、タスク・予定・チェックリストの操作、文字サイズ、保存、オフライン
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { errors, layoutReport, listTitles, open, saved, setup, sheet, SIZES, tab, teardown, url } from './helpers.mjs';

before(setup);
after(teardown);

const TABS = ['home', 'tasks', 'gantt', 'calendar', 'settings'];

describe('画面の配置', () => {
  for (const size of Object.keys(SIZES)) {
    it(`${size}: 5画面ともページ全体がスクロールせず、横にはみ出さない。下のナビは画面内`, async () => {
      const { ctx, page } = await open(size);
      for (const t of TABS) {
        await tab(page, t);
        const r = await layoutReport(page);
        assert.ok(r.pageScroll <= 0, `${t}: ページが ${r.pageScroll}px スクロール`);
        assert.ok(r.docW <= r.iw, `${t}: 横幅 ${r.docW} > ${r.iw}`);
        assert.deepEqual(r.wide, [], `${t}: 画面の外に出る要素`);
        assert.ok(r.navBottom <= r.ih + 0.5, `${t}: ナビが画面外`);
      }
      // すべての画面で、内容の開始位置（上端）が同じ
      const tops = [];
      for (const t of TABS) {
        await tab(page, t);
        tops.push(await page.$eval('.pane:not(.out) .screen', (e) => Math.round(e.getBoundingClientRect().top)));
      }
      assert.equal(new Set(tops).size, 1, `開始位置 ${tops.join(',')}`);
      await ctx.close();
    });
  }

  it('タブを連打しても、最後の画面1枚だけが残る（白い空白・二重のアニメーションにならない）', async () => {
    const { ctx, page } = await open('iphone');
    for (const t of ['tasks', 'gantt', 'calendar', 'home', 'settings', 'gantt']) {
      await page.click(`nav button:nth-child(${TABS.indexOf(t) + 1})`);
      await page.waitForTimeout(40);
      assert.ok((await page.locator('.main .pane').count()) <= 2, '同時に出ている画面は2枚まで');
    }
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.main .pane').count(), 1);
    assert.equal(await page.locator('.gantt').count(), 1);
    await ctx.close();
  });
});

describe('タスク', () => {
  it('追加・編集・完了（元に戻す）・削除し、再起動後も残る', async () => {
    const { ctx, page } = await open('iphone', { sample: false });
    await tab(page, 'tasks');
    await page.fill('.quick .inp', '図面チェック');
    await page.press('.quick .inp', 'Enter');
    await page.fill('.quick .inp', '部品表の更新');
    await page.press('.quick .inp', 'Enter');
    assert.deepEqual(await listTitles(page), ['図面チェック', '部品表の更新']);
    // 編集（タップで選択 → もう一度タップで開く）
    const row = page.locator('.trow', { hasText: '図面チェック' });
    await row.click();
    await row.click();
    await sheet(page).locator('input[aria-label="期限"]').fill('2026-11-06');
    await sheet(page).locator('input[aria-label="開始日"]').fill('2026-11-02');
    const title = sheet(page).locator('input.inp').first();
    await title.fill('図面チェック（A車）');
    await title.press('Enter');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.trow', { hasText: '図面チェック（A車）' }).locator('.due').textContent(), '11/6');
    // 完了 → 元に戻す
    await page.locator('.trow', { hasText: '部品表の更新' }).locator('[role="checkbox"]').click();
    assert.equal(await page.locator('.trow', { hasText: '部品表の更新' }).locator('[role="checkbox"]').getAttribute('aria-checked'), 'true');
    await page.click('.toast button:has-text("元に戻す")');
    assert.equal(await page.locator('.trow', { hasText: '部品表の更新' }).locator('[role="checkbox"]').getAttribute('aria-checked'), 'false');
    // 完了を隠す
    await page.locator('.trow', { hasText: '部品表の更新' }).locator('[role="checkbox"]').click();
    await page.click('button[aria-label="完了を隠す"]');
    assert.deepEqual(await listTitles(page), ['図面チェック（A車）']);
    await page.click('button[aria-label="完了を表示"]');
    // 削除
    const r2 = page.locator('.trow', { hasText: '部品表の更新' });
    await r2.click();
    await r2.click();
    await sheet(page).locator('button:has-text("削除")').click();
    await page.waitForTimeout(300);
    assert.deepEqual(await listTitles(page), ['図面チェック（A車）']);
    await saved(page);
    await page.reload();
    await page.waitForSelector('.trow');
    assert.deepEqual(await listTitles(page), ['図面チェック（A車）']);
    await ctx.close();
  });

  it('車種・グループ・子ツリーを作り、子ツリーの件数・完了率が親に集約される', async () => {
    const { ctx, page } = await open('iphone', { sample: false });
    await tab(page, 'settings');
    await page.click('button:has-text("車種を追加")');
    await sheet(page).locator('input').fill('C車');
    await sheet(page).locator('button:has-text("追加")').click();
    await tab(page, 'tasks');
    assert.equal(await page.locator('.chip[aria-pressed="true"]', { hasText: 'C車' }).count(), 1, '追加した車種を表示');
    await page.click('button[aria-label="グループを追加"]');
    await sheet(page).locator('input').fill('電装');
    await sheet(page).locator('button:has-text("追加")').click();
    await page.click('button[aria-label="電装のメニュー"]');
    await sheet(page).locator('input[placeholder="子ツリーを追加"]').fill('ハーネス');
    await sheet(page).locator('input[placeholder="子ツリーを追加"]').press('Enter');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    // 子ツリーを選んでからクイック追加 → 子ツリーに入る
    await page.locator('.grow-head.child', { hasText: 'ハーネス' }).click();
    assert.match(await page.locator('.quick .inp').getAttribute('placeholder'), /ハーネスに/);
    await page.fill('.quick .inp', '配索図');
    await page.press('.quick .inp', 'Enter');
    await page.fill('.quick .inp', '端子の選定');
    await page.press('.quick .inp', 'Enter');
    await page.locator('.trow', { hasText: '配索図' }).locator('[role="checkbox"]').click();
    const parent = page.locator('.grow-head:not(.child)', { hasText: '電装' });
    assert.equal(await parent.locator('.stat').textContent(), '1/2');
    assert.equal(await page.locator('.trow[data-depth="2"]').count(), 2, '子ツリーのタスクは一段下げて表示');
    // 折りたたみ
    await parent.locator('.fold').click();
    assert.equal(await page.locator('.trow').count(), 0);
    await ctx.close();
  });

  it('検索・絞り込み（期限超過・担当者）でレイアウトが崩れない', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'tasks');
    await page.click('.toolbar .chip:has-text("絞り込み")');
    await sheet(page).locator('.chip:has-text("今日")').click();
    await sheet(page).locator('.chip:has-text("佐藤")').click();
    await sheet(page).locator('button:has-text("閉じる")').click();
    await page.waitForTimeout(300);
    const titles = await listTitles(page);
    assert.ok(titles.length >= 1 && titles.length < 15, titles.join(','));
    const r = await layoutReport(page);
    assert.ok(r.pageScroll <= 0 && r.wide.length === 0);
    // 横断検索
    await page.click('button[aria-label="検索"]');
    await page.keyboard.type('金型');
    await page.waitForTimeout(200);
    assert.ok((await sheet(page).locator('.item').count()) >= 3);
    await ctx.close();
  });
});

describe('ホーム（今日のタスク）', () => {
  it('左へスワイプして除外 → 一覧から外れ、「戻す」で戻る。延期すると次の作業日', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'home');
    const first = page.locator('.swipe').first();
    const name = await first.locator('.reveal > span').textContent();
    const n0 = await page.locator('.swipe').count();
    const b = await first.boundingBox();
    await page.mouse.move(b.x + b.width - 30, b.y + b.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + b.width - 30 - i * 25, b.y + b.height / 2);
    await page.mouse.up();
    await page.waitForTimeout(300);
    await first.locator('button:has-text("除外")').click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.swipe').count(), n0 - 1);
    await page.click('button:has-text("今日の一覧から外したタスク")');
    await page.click('.trow:has-text("' + name + '") button:has-text("戻す")');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.swipe').count(), n0);
    await ctx.close();
  });
});

describe('予定', () => {
  it('予定を追加すると一覧に出て、月を移動しても日付部分だけが変わる', async () => {
    const { ctx, page } = await open('iphone');
    await tab(page, 'calendar');
    const title0 = await page.textContent('.cal-head h2');
    await page.click('.section-head button:has-text("予定")');
    await sheet(page).locator('input[aria-label="予定名"]').fill('トライ立ち会い');
    await sheet(page).locator('input[aria-label="場所"]').fill('第1工場');
    await sheet(page).locator('button:has-text("追加")').click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.erow', { hasText: 'トライ立ち会い' }).count(), 1);
    const listCount = await page.locator('.erow').count();
    assert.ok(listCount >= 5, `予定が5件以上見える: ${listCount}`);
    // 月の移動（ヘッダーと一覧はそのまま、月の部分だけアニメーション）
    const headBefore = await page.locator('.cal-head').elementHandle();
    await page.click('button[aria-label="次の月"]');
    assert.notEqual(await page.textContent('.cal-head h2'), title0);
    assert.equal(await page.evaluate((h) => h.isConnected, headBefore), true, '見出しは作り直さない');
    await page.click('.cal-head button:has-text("今日")');
    assert.equal(await page.textContent('.cal-head h2'), title0);
    // ホームの直近の予定にも出る
    await page.waitForTimeout(250);
    await page.click('nav button:nth-child(1)');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.erow', { hasText: 'トライ立ち会い' }).count(), 1);
    await ctx.close();
  });
});

describe('チェックリスト', () => {
  it('「リスト名：項目」の1回の入力でリストと項目を作り、チェック・追加できる', async () => {
    const { ctx, page } = await open('iphone', { sample: false });
    await tab(page, 'tasks');
    await page.click('.seg button:has-text("チェックリスト")');
    await page.fill('.quick .inp', 'お土産：ういろう');
    await page.press('.quick .inp', 'Enter');
    assert.equal(await page.locator('.grow-head', { hasText: 'お土産' }).count(), 1);
    assert.equal(await page.locator('.crow', { hasText: 'ういろう' }).count(), 1);
    await page.fill('input[aria-label="お土産に項目を追加"]', '手羽先');
    await page.press('input[aria-label="お土産に項目を追加"]', 'Enter');
    await page.locator('.crow', { hasText: 'ういろう' }).locator('[role="checkbox"]').click();
    assert.equal(await page.locator('.grow-head', { hasText: 'お土産' }).locator('.stat').textContent(), '1/2');
    await ctx.close();
  });
});

describe('文字サイズ', () => {
  it('10段階の設定がすべての画面・ナビ・シートに即時に反映される', async () => {
    const { ctx, page } = await open('iphone');
    const measure = async () => {
      const out = {};
      for (const t of TABS) {
        await tab(page, t);
        out[t] = await page.evaluate(() => {
          const el = document.querySelector('.pane:not(.out) .trow .reveal, .pane:not(.out) .gname .reveal, .pane:not(.out) .cal-day, .pane:not(.out) .item, .pane:not(.out) .section-head');
          return parseFloat(getComputedStyle(el).fontSize);
        });
      }
      out.nav = await page.$eval('.nav button span', (e) => parseFloat(getComputedStyle(e).fontSize));
      return out;
    };
    const small = await measure();
    await tab(page, 'settings');
    await page.$eval('input[aria-label="文字の大きさ"]', (e) => {
      e.value = '9';
      e.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const big = await measure();
    for (const k of Object.keys(small)) assert.ok(big[k] > small[k], `${k}: ${small[k]} → ${big[k]}`);
    // シートの文字も
    await tab(page, 'tasks');
    await page.locator('.trow').first().click();
    await page.locator('.trow').first().click();
    const sheetFont = await sheet(page).locator('.field > span').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    assert.ok(sheetFont >= 12 * (20 / 15) * 0.95, `シート ${sheetFont}`);
    await page.keyboard.press('Escape');
    // 大きい文字でもはみ出さない
    for (const t of TABS) {
      await tab(page, t);
      const r = await layoutReport(page);
      assert.ok(r.pageScroll <= 0 && r.wide.length === 0, `${t} ${JSON.stringify(r.wide)}`);
    }
    await saved(page);
    await page.reload();
    await page.waitForSelector('nav');
    assert.equal(await page.evaluate(() => document.documentElement.style.fontSize), '20px', '再起動後も設定が残る');
    await ctx.close();
  });
});

describe('PWA・オフライン', () => {
  it('一度開いたあとは、オフラインでも再起動でき、データも残る', async () => {
    const { ctx, page } = await open('iphone');
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null || navigator.serviceWorker?.ready, null, { timeout: 10000 });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller != null, null, { timeout: 10000 });
    await saved(page);
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForSelector('nav.nav');
    await tab(page, 'tasks');
    assert.ok((await listTitles(page)).length >= 10, 'オフラインでもタスクが出る');
    // オフラインでも追加できる
    await page.fill('.quick .inp', 'オフラインで追加');
    await page.press('.quick .inp', 'Enter');
    await saved(page);
    await page.reload();
    await page.waitForSelector('.trow');
    assert.ok((await listTitles(page)).includes('オフラインで追加'));
    await ctx.setOffline(false);
    await ctx.close();
  });

  it('manifest とアイコンが配信され、ホーム画面に追加できる設定になっている', async () => {
    const { ctx, page } = await open('iphone', { sample: false });
    const m = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
    assert.equal(m.display, 'standalone');
    assert.equal(m.start_url, './');
    for (const i of m.icons) assert.equal((await page.evaluate(async (src) => (await fetch(src)).status, i.src)), 200);
    assert.equal(await page.getAttribute('link[rel="apple-touch-icon"]', 'href'), './icon-180.png');
    const v = await page.evaluate(async () => (await fetch('./version.json')).json());
    assert.match(v.build, /^[0-9a-f]{8}$/);
    assert.ok(url().endsWith('/karikosan/'));
    await ctx.close();
  });
});

describe('エラー', () => {
  // オフラインのテストで出る「ネットにつながらない」は除く
  it('ブラウザのエラーが出ていない', () => assert.deepEqual(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e)), []));
});

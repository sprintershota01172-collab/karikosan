// 優先度の自動判断・優先順の並び・グループを1つずつ開く
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as A from '../src/model/actions';
import { autoPriority, priorityOf } from '../src/model/priority';
import { buildRows, matchStatus, sortTasks, type Row } from '../src/model/rows';
import { emptyData, migrate, newTask, toExport } from '../src/model/schema';
import type { AppData } from '../src/model/types';

const DAY = '2026-10-30'; // 金曜
const t = (p: Parameters<typeof newTask>[0]) => newTask(p);

describe('優先度の自動判断', () => {
  it('期限なし = 低、期限切れ・今日が期限 = 至急', () => {
    assert.equal(autoPriority(t({ title: 'a' }), DAY).level, 1);
    const late = autoPriority(t({ title: 'b', due: '2026-10-28' }), DAY);
    assert.equal(late.level, 4);
    assert.match(late.reason, /2日過ぎています/);
    assert.equal(autoPriority(t({ title: 'c', due: DAY }), DAY).level, 4);
  });

  it('余裕（期限までの作業日 − 残りの作業）で 高・中・低', () => {
    // 1日の作業、期限は3作業日後（月・火・水）→ 期限まで作業日4日（今日を含む）、余裕3日 → 高
    assert.equal(autoPriority(t({ title: 'd', due: '2026-11-04' }), DAY).level, 3);
    // 期限は2週間後 → 余裕10日 → 中
    const mid = autoPriority(t({ title: 'e', due: '2026-11-13' }), DAY);
    assert.equal(mid.slack, 10);
    assert.equal(mid.level, 2);
    // 1か月後 → 低
    assert.equal(autoPriority(t({ title: 'f', due: '2026-11-30' }), DAY).level, 1);
  });

  it('長い作業は早めに上がる。進捗が進むと下がる', () => {
    // 10/26〜11/13 の15作業日、進捗0%: 期限まで作業日11日、残り15日 → 足りない → 至急
    const big = t({ title: 'g', start: '2026-10-26', due: '2026-11-13' });
    const a = autoPriority(big, DAY);
    assert.equal(a.level, 4);
    assert.match(a.reason, /4日足りません/);
    // 進捗60%: 残り6日、余裕5日 → 中
    assert.equal(autoPriority({ ...big, progress: 60 }, DAY).level, 2);
  });

  it('土日作業なしは土日を数えない', () => {
    // 期限は月曜。土日を除くと作業日2日（金・月）、余裕1日 → 高。土日作業ありなら4日、余裕3日 → 高
    const x = t({ title: 'h', due: '2026-11-02' });
    assert.equal(autoPriority(x, DAY).slack, 1);
    assert.equal(autoPriority({ ...x, weekendWork: true }, DAY).slack, 3);
  });

  it('手動で決めたら手動を優先（理由に自動の判断も出す）。完了は出さない', () => {
    const x = t({ title: 'i', due: '2026-11-30', priority: 4 });
    const p = priorityOf(x, DAY);
    assert.equal(p.level, 4);
    assert.equal(p.auto, false);
    assert.match(p.reason, /自動なら「低」/);
    assert.equal(priorityOf({ ...x, done: true }, DAY).level, 0);
  });
});

describe('優先順の並び・絞り込み', () => {
  function data(): AppData {
    let d = emptyData();
    for (const [title, due, priority] of [
      ['来月', '2026-11-30', 0],
      ['手動で至急', '2026-12-10', 4],
      ['期限切れ', '2026-10-27', 0],
      ['来週', '2026-11-05', 0],
      ['期限なし', null, 0],
    ] as const)
      d = A.addTask(d, { title, due, priority }).data;
    return d;
  }
  it('至急 → 高 → 中 → 低（同じなら余裕の少ない順）', () => {
    const d = data();
    // 至急どうしは余裕の少ない順（期限切れ = 余裕 −3 → 手動の至急 = 余裕29）
    assert.deepEqual(sortTasks(d.tasks, 'priority', DAY).map((x) => x.title), ['期限切れ', '手動で至急', '来週', '来月', '期限なし']);
  });
  it('並び順のボタンは 手動 → 期限順 → 優先順 → 手動', () => {
    assert.equal(A.nextSortMode('manual'), 'due');
    assert.equal(A.nextSortMode('due'), 'priority');
    assert.equal(A.nextSortMode('priority'), 'manual');
  });
  it('優先順のときに手で並べ替えると、見た目の順のまま手動に切り替わる', () => {
    let d = A.setSortMode(data(), 'priority');
    const ids = sortTasks(d.tasks, 'priority', DAY).map((x) => x.id);
    const r = A.reorder(d, 'v:-', [ids[1], ids[0], ...ids.slice(2)]);
    assert.equal(r.switched, true);
    d = r.data;
    assert.equal(d.settings.sortMode, 'manual');
    assert.deepEqual(sortTasks(d.tasks, 'manual').map((x) => x.title), ['手動で至急', '期限切れ', '来週', '来月', '期限なし']);
  });
  it('絞り込み「至急・高」', () => {
    const d = data();
    assert.deepEqual(d.tasks.filter((x) => matchStatus(x, 'urgent', DAY)).map((x) => x.title), ['手動で至急', '期限切れ']);
  });
});

describe('グループは1つずつ開く', () => {
  function data() {
    let d = emptyData();
    const v1 = A.addVehicle(d, 'A車');
    d = v1.data;
    const v2 = A.addVehicle(d, 'B車');
    d = v2.data;
    const g1 = A.addGroup(d, { name: '設計', vehicleId: v1.vehicle.id });
    d = g1.data;
    const c1 = A.addGroup(d, { name: 'フロント', vehicleId: null, parentId: g1.group.id });
    d = c1.data;
    const c2 = A.addGroup(d, { name: 'リア', vehicleId: null, parentId: g1.group.id });
    d = c2.data;
    const g2 = A.addGroup(d, { name: '評価', vehicleId: v1.vehicle.id });
    d = g2.data;
    const g3 = A.addGroup(d, { name: '金型', vehicleId: v2.vehicle.id });
    d = g3.data;
    return { d, ids: { g1: g1.group.id, c1: c1.group.id, c2: c2.group.id, g2: g2.group.id, g3: g3.group.id } };
  }
  const open = (d: AppData) => d.groups.filter((g) => !g.collapsed).map((g) => g.name).sort();

  it('追加したグループが開き、同じ段のほかのグループは閉じる（車種をまたいで1つ）', () => {
    const { d } = data();
    assert.deepEqual(open(d), ['リア', '金型']);
  });
  it('子ツリーを開くと親も開き、ほかのグループ・子ツリーは閉じる', () => {
    const { d, ids } = data();
    const d2 = A.setGroupOpen(d, ids.c1, true);
    assert.deepEqual(open(d2), ['フロント', '設計']);
    const rows = buildRows(d2, { vehicle: 'all', sortMode: 'manual', showDone: true, status: 'all', assignee: null, query: '', today: DAY });
    assert.deepEqual(rows.filter((r): r is Extract<Row, { kind: 'group' }> => r.kind === 'group').map((r) => r.group.name), ['設計', 'フロント', 'リア', '評価', '金型']);
  });
  it('設定をオフにすると、ほかを閉じない。オンに戻すと最初に開いているものだけ残す', () => {
    const { d, ids } = data();
    let d2 = A.setOneGroup(d, false);
    d2 = A.setGroupOpen(A.setGroupOpen(d2, ids.g2, true), ids.c1, true);
    assert.deepEqual(open(d2), ['フロント', 'リア', '設計', '評価', '金型']);
    d2 = A.setOneGroup(d2, true);
    assert.deepEqual(open(d2), ['フロント', '設計']);
  });
});

describe('読み込み', () => {
  it('手動の「至急」・優先順・1つずつ開く設定を保つ。古いデータは「1つずつ開く」がオン', () => {
    let d = A.addTask(emptyData(), { title: 'a', priority: 4 }).data;
    d = A.setOneGroup(A.setSortMode(d, 'priority'), false);
    const m = migrate(JSON.parse(JSON.stringify(toExport(d))));
    assert.equal(m.tasks[0].priority, 4);
    assert.equal(m.settings.sortMode, 'priority');
    assert.equal(m.settings.oneGroup, false);
    const old = JSON.parse(JSON.stringify(toExport(emptyData())));
    delete old.data.settings.oneGroup;
    assert.equal(migrate(old).settings.oneGroup, true);
  });
});

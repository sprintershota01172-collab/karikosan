// データの操作（追加・並べ替え・期限順・グループ・今日のタスク・予定の繰り返し・読み込みの検査）
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as A from '../src/model/actions';
import { addWorkdays } from '../src/model/dates';
import { occurrences, occursOn } from '../src/model/recur';
import { buildRows, containerOf, todayList, type Row, type ViewOpts } from '../src/model/rows';
import { sampleData } from '../src/model/sample';
import { DataError, emptyData, migrate, SCHEMA, toExport } from '../src/model/schema';
import { search } from '../src/model/search';
import type { AppData } from '../src/model/types';

const DAY = '2026-10-30'; // 金曜
const view = (d: AppData, o: Partial<ViewOpts> = {}): Row[] => buildRows(d, { vehicle: 'all', sortMode: d.settings.sortMode, showDone: d.settings.showDone, status: 'all', assignee: null, query: '', today: DAY, ...o });
const taskTitles = (rows: Row[]) => rows.filter((r) => r.kind === 'task').map((r) => (r as Extract<Row, { kind: 'task' }>).task.title);

function base() {
  let d = emptyData();
  const v = A.addVehicle(d, 'A車');
  d = v.data;
  const g = A.addGroup(d, { name: '設計', vehicleId: v.vehicle.id });
  d = g.data;
  const c = A.addGroup(d, { name: 'フロント', vehicleId: null, parentId: g.group.id });
  d = c.data;
  for (const [t, due] of [['a', '2026-11-05'], ['b', '2026-11-02'], ['c', null], ['d', '2026-10-28']] as const) d = A.addTask(d, { title: t, groupId: g.group.id, due }).data;
  d = A.addTask(d, { title: 'x', groupId: c.group.id }).data;
  return { d, v: v.vehicle, g: g.group, c: c.group };
}

describe('行（一覧とガントで共通）', () => {
  it('車種 → グループ → タスク → 子ツリー の順。子ツリーは親の車種に入る', () => {
    const { d, c } = base();
    assert.equal(c.vehicleId, d.vehicles[0].id);
    const rows = view(d);
    assert.deepEqual(rows.map((r) => r.kind), ['vehicle', 'group', 'task', 'task', 'task', 'task', 'group', 'task']);
    assert.deepEqual(taskTitles(rows), ['a', 'b', 'c', 'd', 'x']);
    const g = rows[1] as Extract<Row, { kind: 'group' }>;
    assert.equal(g.stats.total, 5, '親には子ツリーのタスクも集約');
  });

  it('期限順: 期限の近い順（期限なしは最後）', () => {
    const { d } = base();
    assert.deepEqual(taskTitles(view(A.setSortMode(d, 'due'))), ['d', 'b', 'a', 'c', 'x']);
  });

  it('完了の非表示・絞り込み（期限超過）・ことば', () => {
    const { d } = base();
    const id = d.tasks.find((t) => t.title === 'b')!.id;
    const d2 = A.setSettings(A.setDone(d, id, true), { showDone: false });
    assert.deepEqual(taskTitles(view(d2)), ['a', 'c', 'd', 'x']);
    assert.deepEqual(taskTitles(view(d, { status: 'overdue' })), ['d']);
    assert.deepEqual(taskTitles(view(d, { query: 'フロント' })), ['x'], 'グループ名でも探せる');
  });

  it('折りたたむと見出しだけ。絞り込み中は空のグループを出さない', () => {
    const { d, g } = base();
    const rows = view(A.updateGroup(d, g.id, { collapsed: true }));
    assert.deepEqual(rows.map((r) => r.kind), ['vehicle', 'group']);
    assert.equal(view(d, { query: 'zzz' }).length, 0);
  });

  it('固定したグループは「すべて」表示のいちばん上', () => {
    let { d } = base();
    const v2 = A.addVehicle(d, 'B車');
    d = v2.data;
    const g2 = A.addGroup(d, { name: '金型', vehicleId: v2.vehicle.id });
    d = A.addTask(g2.data, { title: 'm', groupId: g2.group.id }).data;
    d = A.updateGroup(d, g2.group.id, { pinned: true });
    const rows = view(d);
    assert.equal(rows[0].kind, 'pinned');
    assert.equal((rows[1] as Extract<Row, { kind: 'group' }>).group.name, '金型');
  });
});

describe('並べ替え', () => {
  it('手動: 間に入れた順番で保存し、見えていないタスクの相対位置も保つ', () => {
    const { d, g } = base();
    const ids = Object.fromEntries(d.tasks.map((t) => [t.title, t.id]));
    // c を隠した状態で d を a と b の間へ
    const hidden = A.setSettings(A.setDone(d, ids.c, true), { showDone: false });
    const r = A.reorder(hidden, `g:${g.id}`, [ids.a, ids.d, ids.b]);
    assert.equal(r.switched, false);
    assert.deepEqual(taskTitles(view(A.setSettings(r.data, { showDone: true }))), ['a', 'd', 'b', 'c', 'x']);
  });

  it('期限順のまま動かすと、見た目の順を保って手動に切り替わる', () => {
    const { d, g } = base();
    const due = A.setSortMode(d, 'due');
    const ids = Object.fromEntries(d.tasks.map((t) => [t.title, t.id]));
    // 期限順の見た目 d, b, a, c → c を先頭へ
    const r = A.reorder(due, `g:${g.id}`, [ids.c, ids.d, ids.b, ids.a]);
    assert.equal(r.switched, true);
    assert.equal(r.data.settings.sortMode, 'manual');
    assert.deepEqual(taskTitles(view(r.data)), ['c', 'd', 'b', 'a', 'x']);
  });

  it('期限順: 期限を変えると自動で並び直す', () => {
    const { d } = base();
    let due = A.setSortMode(d, 'due');
    const a = due.tasks.find((t) => t.title === 'a')!;
    due = A.setTaskRange(due, a.id, '2026-10-20', '2026-10-21');
    assert.deepEqual(taskTitles(view(due)).slice(0, 2), ['a', 'd']);
  });

  it('グループを変えると、移動先の最後に入る', () => {
    const { d, c } = base();
    const a = d.tasks.find((t) => t.title === 'a')!;
    const d2 = A.updateTask(d, a.id, { groupId: c.id });
    const moved = d2.tasks.find((t) => t.id === a.id)!;
    assert.equal(containerOf(moved), `g:${c.id}`);
    assert.deepEqual(taskTitles(view(d2)), ['b', 'c', 'd', 'x', 'a']);
  });
});

describe('グループ・車種の削除でタスクを失わない', () => {
  it('グループを消すと、子ツリーのタスクも車種の直下へ移る', () => {
    const { d, g } = base();
    const d2 = A.deleteGroup(d, g.id);
    assert.equal(d2.tasks.length, 5);
    assert.equal(d2.groups.length, 0);
    assert.ok(d2.tasks.every((t) => t.groupId == null && t.vehicleId === d.vehicles[0].id));
  });
  it('車種を消すと「車種なし」へ', () => {
    const { d, v } = base();
    const d2 = A.deleteVehicle(A.setSettings(d, { vehicle: v.id }), v.id);
    assert.equal(d2.tasks.length, 5);
    assert.ok(d2.tasks.every((t) => t.vehicleId == null));
    assert.equal(d2.settings.vehicle, 'all');
  });
  it('子ツリーは1段まで（子ツリーの下に作ると親につく）', () => {
    const { d, g, c } = base();
    const r = A.addGroup(d, { name: '孫', vehicleId: null, parentId: c.id });
    assert.equal(r.group.parentId, g.id);
  });
});

describe('土日作業', () => {
  it('土日作業なし: 期間の端が土日なら作業日に寄せる。ありなら そのまま', () => {
    let d = emptyData();
    d = A.addTask(d, { title: 't', start: '2026-10-31', due: '2026-11-08' }).data;
    const t = d.tasks[0];
    assert.equal(t.start, '2026-11-02');
    assert.equal(t.due, '2026-11-06');
    const d2 = A.updateTask(d, t.id, { weekendWork: true, start: '2026-10-31', due: '2026-11-08' });
    assert.equal(d2.tasks[0].start, '2026-10-31');
    assert.equal(d2.tasks[0].due, '2026-11-08');
  });
});

describe('今日のタスク', () => {
  it('期限切れ・今日が期限・期間中が対象。除外・戻す・延期', () => {
    let d = emptyData();
    d = A.addTask(d, { title: '期限切れ', due: '2026-10-28' }).data;
    d = A.addTask(d, { title: '今日', due: DAY }).data;
    d = A.addTask(d, { title: '期間中', start: '2026-10-29', due: '2026-11-03' }).data;
    d = A.addTask(d, { title: '来週', start: '2026-11-04', due: '2026-11-05' }).data;
    // 優先度の高い順: 期限切れ（2日過ぎ）→ 期間中（着手が1日遅れ: 作業日4日に対して残り3日）→ 今日が期限（1日の作業に1日）
    assert.deepEqual(todayList(d, DAY).list.map((t) => t.title), ['期限切れ', '期間中', '今日']);
    const id = d.tasks[1].id;
    d = A.hideToday(d, id, DAY);
    assert.deepEqual(todayList(d, DAY).list.map((t) => t.title), ['期限切れ', '期間中']);
    assert.deepEqual(todayList(d, DAY).hidden.map((t) => t.title), ['今日']);
    d = A.unhideToday(d, id, DAY);
    assert.equal(todayList(d, DAY).list.length, 3);
    d = A.postpone(d, id, DAY);
    assert.equal(d.tasks[1].due, addWorkdays(DAY, 1, false), '金曜の次の作業日は月曜');
    assert.equal(d.tasks[1].due, '2026-11-02');
  });
});

describe('予定の繰り返し', () => {
  it('平日・毎週・毎月（月末は最終日）・終わりの日', () => {
    let d = emptyData();
    d = A.addEvent(d, { title: '朝会', date: '2026-10-29', repeat: 'weekdays', until: '2026-11-04' }).data;
    d = A.addEvent(d, { title: '月例', date: '2026-01-31', repeat: 'monthly' }).data;
    d = A.addEvent(d, { title: '週次', date: '2026-10-26', repeat: 'weekly', startTime: '09:00' }).data;
    const o = occurrences(d, '2026-10-29', '2026-11-05');
    assert.deepEqual(o.filter((x) => x.event.title === '朝会').map((x) => x.date), ['2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03', '2026-11-04']);
    assert.deepEqual(o.filter((x) => x.event.title === '週次').map((x) => x.date), ['2026-11-02']);
    assert.ok(occursOn(d.events[1], '2026-02-28'));
    assert.ok(occursOn(d.events[1], '2026-04-30'));
    assert.ok(!occursOn(d.events[1], '2026-04-29'));
  });
});

describe('保存データの検査・移行', () => {
  it('書き出したデータを読み込むと同じ内容', () => {
    const d = sampleData(DAY);
    const back = migrate(JSON.parse(JSON.stringify(toExport(d))));
    assert.deepEqual({ ...back, updatedAt: 0 }, { ...d, updatedAt: 0 });
  });
  it('壊れた項目は既定値で埋め、id のないもの・重複は除く。参照の切れたグループは外す', () => {
    const m = migrate({ schema: 1, tasks: [{ id: 't1', title: 'ok', due: '2026-13-40', progress: 250, groupId: 'nope' }, { id: 't1', title: 'dup' }, { title: 'noid' }], vehicles: [] });
    assert.equal(m.tasks.length, 1);
    assert.equal(m.tasks[0].due, null);
    assert.equal(m.tasks[0].progress, 100);
    assert.equal(m.tasks[0].groupId, null);
    assert.equal(m.schema, SCHEMA);
  });
  it('別のアプリのデータ・新しい版のデータは読み込まない', () => {
    assert.throws(() => migrate({ hello: 1 }), DataError);
    assert.throws(() => migrate({ schema: SCHEMA + 1, tasks: [] }), DataError);
  });
});

describe('検索', () => {
  it('タスク・予定・グループ・車種を横断（全角半角を区別しない）', () => {
    const d = sampleData(DAY);
    const r = search(d, 'ｒｅｖｉｅｗ レビュー'.replace('ｒｅｖｉｅｗ ', ''));
    assert.equal(r.events[0]?.title, '設計レビュー');
    assert.ok(search(d, '金型').groups.length === 1);
    assert.ok(search(d, 'A車').vehicles.length === 1);
    assert.ok(search(d, '佐藤').tasks.length >= 2, '担当者でも探せる');
  });
});

describe('サンプル', () => {
  it('20件近いタスクと、子ツリー・予定がある', () => {
    const d = sampleData(DAY);
    assert.ok(d.tasks.length >= 15);
    assert.ok(d.groups.some((g) => g.parentId));
    assert.ok(d.events.length >= 3);
  });
});

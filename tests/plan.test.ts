// 大日程: 週へのそろえ・週ごとの負荷・段の詰め方・行・操作・読み込み
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as A from '../src/model/actions';
import { addPlan, deletePlan, loadLevel, packLanes, planRange, planRows, setPlanWeeks, snapWeeks, updatePlan, weeklyLoad, weeksOf } from '../src/model/plan';
import { sampleData } from '../src/model/sample';
import { emptyData, migrate, SCHEMA, toExport } from '../src/model/schema';
import type { AppData } from '../src/model/types';

const DAY = '2026-10-30'; // 金曜。週の初め（月曜）は 10/26

function base() {
  let d: AppData = emptyData();
  const a = A.addVehicle(d, 'A車');
  d = a.data;
  const b = A.addVehicle(d, 'B車');
  d = b.data;
  return { d, a: a.vehicle.id, b: b.vehicle.id };
}

describe('週へのそろえ', () => {
  it('開始は月曜、終わりは日曜。逆なら入れ替える', () => {
    assert.deepEqual(snapWeeks('2026-10-30', '2026-11-04'), { start: '2026-10-26', end: '2026-11-08' });
    assert.deepEqual(snapWeeks('2026-11-04', '2026-10-30'), { start: '2026-10-26', end: '2026-11-08' });
    assert.equal(weeksOf({ start: '2026-10-26', end: '2026-11-08' }), 2);
  });
  it('追加・変更でも週にそろう。週数を変える', () => {
    let { d, a } = base();
    const r = addPlan(d, { title: '試作', vehicleId: a, start: '2026-10-28', end: '2026-11-10', load: 3, kind: 'proto' });
    d = r.data;
    assert.equal(r.plan.start, '2026-10-26');
    assert.equal(r.plan.end, '2026-11-15');
    d = updatePlan(d, r.plan.id, { start: '2026-11-03', end: '2026-11-03' });
    assert.deepEqual([d.plans[0].start, d.plans[0].end], ['2026-11-02', '2026-11-08']);
    d = setPlanWeeks(d, r.plan.id, 4);
    assert.equal(weeksOf(d.plans[0]), 4);
    d = deletePlan(d, r.plan.id);
    assert.equal(d.plans.length, 0);
  });
});

describe('週ごとの負荷', () => {
  it('かかっている週に重み（小1・中2・大3）を足す。車種ごとにも出せる', () => {
    let { d, a, b } = base();
    d = addPlan(d, { title: 'x', vehicleId: a, start: '2026-10-26', end: '2026-11-08', load: 3 }).data; // 2週
    d = addPlan(d, { title: 'y', vehicleId: b, start: '2026-11-02', end: '2026-11-15', load: 2 }).data; // 2週（1週重なる）
    d = addPlan(d, { title: 'z', vehicleId: null, start: '2026-11-09', end: '2026-11-09', load: 1 }).data;
    assert.deepEqual(weeklyLoad(d.plans, '2026-10-26', 4), [3, 5, 3, 0]);
    assert.deepEqual(weeklyLoad(d.plans, '2026-10-26', 4, a), [3, 3, 0, 0]);
    assert.deepEqual([0, 1, 3, 4, 6, 7, 10].map(loadLevel), [0, 1, 1, 2, 2, 3, 3]);
  });
  it('範囲の外にはみ出したイベントも、範囲の中の週だけ数える', () => {
    let { d, a } = base();
    d = addPlan(d, { title: 'long', vehicleId: a, start: '2026-09-07', end: '2026-12-27', load: 2 }).data;
    assert.deepEqual(weeklyLoad(d.plans, '2026-10-26', 3), [2, 2, 2]);
  });
});

describe('まとめの表示（大日程）', () => {
  it('重ならないイベントは同じ段、重なるものは次の段', () => {
    let { d, a } = base();
    d = addPlan(d, { title: '設計', vehicleId: a, start: '2026-10-05', end: '2026-10-25' }).data;
    d = addPlan(d, { title: '試作', vehicleId: a, start: '2026-10-26', end: '2026-11-22' }).data;
    d = addPlan(d, { title: '評価', vehicleId: a, start: '2026-11-09', end: '2026-12-06' }).data;
    const { lane, lanes } = packLanes(d.plans);
    assert.equal(lanes, 2);
    const t = (n: string) => lane.get(d.plans.find((p) => p.title === n)!.id);
    assert.deepEqual([t('設計'), t('試作'), t('評価')], [0, 0, 1]);
  });
  it('すべて: 共通（あるとき）→ 車種の順に段を並べる。イベントのない車種も1段出す。車種を選ぶと1件1行', () => {
    let { d, a } = base();
    d = addPlan(d, { title: '試作', vehicleId: a, start: DAY }).data;
    let rows = planRows(d, 'all');
    assert.deepEqual(rows.map((r) => (r.kind === 'lane' ? `${r.vehicle?.name}:${r.events.length}` : '')), ['A車:1', 'B車:0']);
    d = addPlan(d, { title: '休み', vehicleId: null, start: DAY }).data;
    rows = planRows(d, 'all');
    assert.equal(rows[0].kind === 'lane' && rows[0].vehicleId, null);
    const one = planRows(d, a);
    assert.deepEqual(one.map((r) => r.kind === 'event' && r.event.title), ['試作']);
  });
  it('表示の範囲は月曜はじまりで、今週の8週前から少なくとも1年先まで', () => {
    const r = planRange([], DAY);
    assert.equal(r.from, '2026-08-31');
    assert.ok(r.weeks >= 60);
  });
});

describe('車種を消しても大日程は残る・読み込み', () => {
  it('車種を消すと「共通」へ移る', () => {
    let { d, a } = base();
    d = addPlan(d, { title: '試作', vehicleId: a, start: DAY }).data;
    d = A.deleteVehicle(d, a);
    assert.equal(d.plans.length, 1);
    assert.equal(d.plans[0].vehicleId, null);
  });
  it('前の版（大日程なし）のデータは、空の大日程で読み込む。書き出して読み込むと同じ', () => {
    assert.equal(SCHEMA, 3);
    const old = JSON.parse(JSON.stringify(toExport(emptyData())));
    old.data.schema = 1;
    delete old.data.plans;
    delete old.data.settings.planZoom;
    const m = migrate(old);
    assert.deepEqual(m.plans, []);
    assert.equal(m.settings.planZoom, 'week');
    const s = sampleData(DAY);
    assert.ok(s.plans.length >= 8);
    const back = migrate(JSON.parse(JSON.stringify(toExport(s))));
    assert.deepEqual(back.plans, s.plans);
  });
  it('壊れたイベント（日付なし・重みが範囲外）は直すか捨てる', () => {
    const raw = { schema: 2, vehicles: [], tasks: [], plans: [{ id: 'p1', title: 'a', start: '2026-11-02', end: '2026-11-08', load: 9, kind: 'xx' }, { id: 'p2', title: 'b' }] };
    const m = migrate(raw);
    assert.equal(m.plans.length, 1);
    assert.equal(m.plans[0].load, 2);
    assert.equal(m.plans[0].kind, 'other');
  });
});

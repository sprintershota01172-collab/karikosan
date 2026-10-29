// 日付・作業日の計算（月またぎ・土日をはさむ期間）
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays, addWorkdays, isDateStr, normalizeRange, resizeEnd, resizeStart, shiftRange, snapBackward, snapForward, spanDays, startOfWeek, weekday, workdays, workRuns } from '../src/model/dates';

// 2026-10-30 は金曜、10-31 土、11-01 日、11-02 月
describe('日付', () => {
  it('曜日と月またぎ', () => {
    assert.equal(weekday('2026-10-30'), 5);
    assert.equal(addDays('2026-10-30', 3), '2026-11-02');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(spanDays('2026-10-30', '2026-11-02'), 4);
    assert.equal(startOfWeek('2026-11-01'), '2026-10-26');
    assert.ok(isDateStr('2026-02-28') && !isDateStr('2026-02-30') && !isDateStr('20261030'));
  });
  it('作業日の数（土日作業なし／あり）', () => {
    assert.equal(workdays('2026-10-30', '2026-11-02', false), 2);
    assert.equal(workdays('2026-10-30', '2026-11-02', true), 4);
    assert.equal(workdays('2026-10-26', '2026-11-06', false), 10);
    assert.equal(workdays('2026-11-02', '2026-10-30', false), 0);
    assert.equal(workdays('2026-10-31', '2026-11-01', false), 0);
  });
  it('作業日を進める・戻す', () => {
    assert.equal(addWorkdays('2026-10-30', 1, false), '2026-11-02');
    assert.equal(addWorkdays('2026-11-02', -1, false), '2026-10-30');
    assert.equal(addWorkdays('2026-10-31', 0, false), '2026-11-02');
    assert.equal(addWorkdays('2026-10-30', 1, true), '2026-10-31');
    assert.equal(snapForward('2026-10-31', false), '2026-11-02');
    assert.equal(snapBackward('2026-11-01', false), '2026-10-30');
    assert.equal(snapForward('2026-10-31', true), '2026-10-31');
  });
  it('平行移動は作業日数を保つ（土日をはさむ・月またぎ）', () => {
    // 木〜金（2作業日）を1日後ろへ → 金〜月
    assert.deepEqual(shiftRange('2026-10-29', '2026-10-30', 1, false), { start: '2026-10-30', end: '2026-11-02' });
    // 金曜始まりを1日後ろ（土曜）へ → 月曜に寄せる
    assert.deepEqual(shiftRange('2026-10-30', '2026-10-30', 1, false), { start: '2026-11-02', end: '2026-11-02' });
    // 月曜を1日前（日曜）へ → 金曜に寄せる
    assert.deepEqual(shiftRange('2026-11-02', '2026-11-03', -1, false), { start: '2026-10-30', end: '2026-11-02' });
    // 土日作業ありならカレンダーどおり
    assert.deepEqual(shiftRange('2026-10-29', '2026-10-30', 1, true), { start: '2026-10-30', end: '2026-10-31' });
  });
  it('期間の伸縮は土日に落ちない・逆転しない', () => {
    assert.equal(resizeEnd('2026-10-28', '2026-11-01', false), '2026-10-30');
    assert.equal(resizeEnd('2026-10-28', '2026-10-20', false), '2026-10-28');
    assert.equal(resizeStart('2026-10-31', '2026-11-05', false), '2026-11-02');
    assert.equal(resizeStart('2026-11-09', '2026-11-05', false), '2026-11-05');
    assert.deepEqual(normalizeRange('2026-10-31', '2026-11-01', false), { start: '2026-11-02', end: '2026-11-02' });
  });
  it('作業日の連続区間（週末で区切る）', () => {
    assert.deepEqual(workRuns('2026-10-29', '2026-11-03', false), [
      { start: '2026-10-29', end: '2026-10-30' },
      { start: '2026-11-02', end: '2026-11-03' },
    ]);
    assert.deepEqual(workRuns('2026-10-29', '2026-11-03', true), [{ start: '2026-10-29', end: '2026-11-03' }]);
  });
});

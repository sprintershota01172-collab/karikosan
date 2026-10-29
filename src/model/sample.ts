/** 試しに使うためのサンプル（設定から入れる）。今日を基準に日付を作る */
import { addChecklist, addEvent, addGroup, addTask, addVehicle } from './actions';
import { addWorkdays, today } from './dates';
import { emptyData } from './schema';
import type { AppData } from './types';

export function sampleData(day: string = today()): AppData {
  let d = emptyData();
  const v1 = addVehicle(d, 'A車（新型SUV）');
  d = v1.data;
  const v2 = addVehicle(d, 'B車（改良）');
  d = v2.data;
  const g1 = addGroup(d, { name: 'ボデー設計', vehicleId: v1.vehicle.id });
  d = g1.data;
  const c1 = addGroup(d, { name: 'フロント周り', vehicleId: v1.vehicle.id, parentId: g1.group.id });
  d = c1.data;
  const c2 = addGroup(d, { name: 'リア周り', vehicleId: v1.vehicle.id, parentId: g1.group.id });
  d = c2.data;
  const g2 = addGroup(d, { name: '試作・評価', vehicleId: v1.vehicle.id });
  d = g2.data;
  const g3 = addGroup(d, { name: '金型', vehicleId: v2.vehicle.id });
  d = g3.data;
  const w = (n: number) => addWorkdays(day, n, false);
  const tasks: [string, string | null, string | null, number, number, number, string][] = [
    // [名前, グループ, 車種, 開始(作業日), 期間(作業日), 進捗, 担当]
    ['構想図の確認', c1.group.id, null, -6, 4, 100, '佐藤'],
    ['バンパー形状の検討', c1.group.id, null, -2, 5, 40, '佐藤'],
    ['ヘッドランプ取付検討', c1.group.id, null, 1, 4, 0, '鈴木'],
    ['フード開閉の干渉確認', c1.group.id, null, 3, 3, 0, '鈴木'],
    ['リアゲート構造の見直し', c2.group.id, null, -3, 6, 30, '田中'],
    ['テールランプ配置', c2.group.id, null, 2, 3, 0, '田中'],
    ['図面の出図', g1.group.id, null, 6, 2, 0, '佐藤'],
    ['試作部品の手配', g2.group.id, null, -1, 3, 60, '高橋'],
    ['衝突解析の依頼', g2.group.id, null, 4, 5, 0, '高橋'],
    ['評価計画書の作成', g2.group.id, null, 0, 2, 20, '伊藤'],
    ['型構想の打ち合わせ準備', g3.group.id, null, -1, 2, 50, '渡辺'],
    ['金型日程の調整', g3.group.id, null, 2, 6, 0, '渡辺'],
    ['トライ結果のまとめ', g3.group.id, null, 8, 3, 0, '山本'],
    ['原価の見積もり', null, v2.vehicle.id, 5, 4, 0, '山本'],
    ['週報の提出', null, null, 0, 1, 0, ''],
  ];
  tasks.forEach(([title, gid, vid, s, len, prog, who], i) => {
    d = addTask(d, { title, groupId: gid, vehicleId: vid, start: w(s), due: w(s + len - 1), progress: prog, done: prog === 100, assignee: who, priority: (i % 4) as 0 | 1 | 2 | 3 }).data;
  });
  d = addEvent(d, { title: '設計レビュー', date: w(1), startTime: '10:00', endTime: '11:30', place: '第2会議室', vehicleId: v1.vehicle.id }).data;
  d = addEvent(d, { title: '朝会', date: day, startTime: '08:45', endTime: '09:00', repeat: 'weekdays' }).data;
  d = addEvent(d, { title: '金型メーカー打ち合わせ', date: w(3), startTime: '14:00', endTime: '15:00', place: 'オンライン', vehicleId: v2.vehicle.id }).data;
  d = addEvent(d, { title: '試作車の確認', date: w(6), startTime: '13:00', endTime: '16:00', place: '試作工場', vehicleId: v1.vehicle.id }).data;
  d = addChecklist(d, '出張のお土産', 'チームへのお菓子').data;
  return d;
}

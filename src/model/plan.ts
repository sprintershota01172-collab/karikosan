/**
 * 大日程: 車種ごとのイベント（設計・試作・評価・量産など）を週の単位で並べ、週ごとの負荷を合計する。
 *  - 1マス = 1週（月曜はじまり）。イベントの開始は週の初め、終わりは週の終わりにそろえる
 *  - 負荷 = その週にかかっているイベントの重み（小1・中2・大3）の合計
 *  - まとめて見るときは、車種ごとに重ならないイベントを同じ段に詰めて並べる（大日程をコンパクトに）
 */
import { addDays, diffDays, startOfWeek, toDay } from './dates';
import { uid } from './schema';
import type { AppData, DateStr, ID, PlanEvent, PlanKind, Vehicle } from './types';

export const PLAN_KINDS: Record<PlanKind, { label: string; color: string }> = {
  design: { label: '設計', color: '#3B6EA8' },
  proto: { label: '試作', color: '#3D7469' },
  eval: { label: '評価', color: '#8E5BA8' },
  prep: { label: '生産準備', color: '#B7791F' },
  mass: { label: '量産', color: '#C2554A' },
  other: { label: 'その他', color: '#7D8AA0' },
};
export const PLAN_KIND_ORDER: PlanKind[] = ['design', 'proto', 'eval', 'prep', 'mass', 'other'];
export const LOAD_LABEL: Record<1 | 2 | 3, string> = { 1: '小', 2: '中', 3: '大' };

/** 週の初めと終わりにそろえる（逆なら入れ替える） */
export function snapWeeks(start: DateStr, end: DateStr): { start: DateStr; end: DateStr } {
  const a = startOfWeek(start <= end ? start : end);
  const b = addDays(startOfWeek(start <= end ? end : start), 6);
  return { start: a, end: b };
}

export const weeksOf = (p: Pick<PlanEvent, 'start' | 'end'>): number => Math.max(1, Math.round((diffDays(p.start, p.end) + 1) / 7));

/** 表示する週の範囲（今週の8週前から、1年後かいちばん遅いイベントの8週後まで） */
export function planRange(plans: PlanEvent[], today: DateStr): { from: DateStr; weeks: number } {
  const from = addDays(startOfWeek(today), -8 * 7);
  let last = toDay(addDays(startOfWeek(today), 52 * 7));
  let first = toDay(from);
  for (const p of plans) {
    last = Math.max(last, toDay(p.end) + 8 * 7);
    first = Math.min(first, toDay(startOfWeek(p.start)) - 2 * 7);
  }
  const f = addDays('1970-01-01', first);
  const start = startOfWeek(f);
  return { from: start, weeks: Math.ceil((last - toDay(start) + 1) / 7) };
}

/** 週ごとの負荷（重みの合計）。vehicle を渡すとその車種だけ */
export function weeklyLoad(plans: PlanEvent[], from: DateStr, weeks: number, vehicle: ID | 'all' = 'all'): number[] {
  const out = new Array<number>(weeks).fill(0);
  const f = toDay(from);
  for (const p of plans) {
    if (vehicle !== 'all' && p.vehicleId !== vehicle) continue;
    const a = Math.max(0, Math.floor((toDay(p.start) - f) / 7));
    const b = Math.min(weeks - 1, Math.floor((toDay(p.end) - f) / 7));
    for (let i = a; i <= b; i++) out[i] += p.load;
  }
  return out;
}

/** 負荷の段階: 0 なし / 1 ふつう（1〜3）/ 2 多め（4〜6）/ 3 とても多い（7以上） */
export const loadLevel = (n: number): 0 | 1 | 2 | 3 => (n <= 0 ? 0 : n <= 3 ? 1 : n <= 6 ? 2 : 3);
export const LOAD_LEVEL_LABEL = ['', 'ふつう', '多め', 'とても多い'] as const;

/** 重ならないイベントを同じ段に詰める（開始の早い順に、空いているいちばん上の段へ） */
export function packLanes(list: PlanEvent[]): { lane: Map<ID, number>; lanes: number } {
  const sorted = [...list].sort((a, b) => toDay(a.start) - toDay(b.start) || toDay(b.end) - toDay(a.end) || a.createdAt - b.createdAt);
  const ends: number[] = [];
  const lane = new Map<ID, number>();
  for (const p of sorted) {
    let i = ends.findIndex((e) => e < toDay(p.start));
    if (i < 0) i = ends.length;
    ends[i] = toDay(p.end);
    lane.set(p.id, i);
  }
  return { lane, lanes: Math.max(1, ends.length) };
}

export type PlanRow =
  /** まとめ: 車種の1段（events はその段のイベント） */
  | { kind: 'lane'; key: string; vehicle: Vehicle | null; vehicleId: ID | null; lane: number; lanes: number; events: PlanEvent[] }
  /** 車種ごと: イベント1つで1行 */
  | { kind: 'event'; key: string; event: PlanEvent; vehicle: Vehicle | null };

const byStart = (a: PlanEvent, b: PlanEvent) => toDay(a.start) - toDay(b.start) || toDay(a.end) - toDay(b.end) || a.createdAt - b.createdAt;

export function planRows(data: AppData, vehicle: ID | 'all'): PlanRow[] {
  const vs = [...data.vehicles].sort((a, b) => a.order - b.order);
  if (vehicle !== 'all') {
    const v = vs.find((x) => x.id === vehicle) ?? null;
    return data.plans
      .filter((p) => p.vehicleId === vehicle)
      .sort(byStart)
      .map((p) => ({ kind: 'event' as const, key: p.id, event: p, vehicle: v }));
  }
  const rows: PlanRow[] = [];
  const add = (vehicleId: ID | null, v: Vehicle | null) => {
    const list = data.plans.filter((p) => p.vehicleId === vehicleId);
    if (vehicleId == null && !list.length) return; // 共通は、あるときだけ
    const { lane, lanes } = packLanes(list);
    for (let i = 0; i < lanes; i++)
      rows.push({ kind: 'lane', key: `${vehicleId ?? '-'}:${i}`, vehicle: v, vehicleId, lane: i, lanes, events: list.filter((p) => lane.get(p.id) === i).sort(byStart) });
  };
  add(null, null);
  for (const v of vs) add(v.id, v);
  return rows;
}

/* ---------- 操作 ---------- */

const touch = (d: AppData): AppData => ({ ...d, updatedAt: Date.now() });

export function addPlan(d: AppData, p: Partial<PlanEvent> & { title: string; start: DateStr; end?: DateStr }): { data: AppData; plan: PlanEvent } {
  const r = snapWeeks(p.start, p.end ?? p.start);
  const now = Date.now();
  const plan: PlanEvent = { id: uid('p'), vehicleId: p.vehicleId ?? null, kind: p.kind ?? 'other', load: p.load ?? 2, memo: p.memo ?? '', createdAt: now, updatedAt: now, ...p, title: p.title.trim() || 'イベント', start: r.start, end: r.end };
  return { data: touch({ ...d, plans: [...d.plans, plan] }), plan };
}

export function updatePlan(d: AppData, id: ID, patch: Partial<PlanEvent>): AppData {
  return touch({
    ...d,
    plans: d.plans.map((p) => {
      if (p.id !== id) return p;
      const n = { ...p, ...patch, id, updatedAt: Date.now() };
      const r = snapWeeks(n.start, n.end);
      return { ...n, start: r.start, end: r.end };
    }),
  });
}

/** 週数を変える（開始はそのまま） */
export const setPlanWeeks = (d: AppData, id: ID, weeks: number): AppData => {
  const p = d.plans.find((x) => x.id === id);
  return p ? updatePlan(d, id, { end: addDays(p.start, Math.max(1, Math.round(weeks)) * 7 - 1) }) : d;
};

export const deletePlan = (d: AppData, id: ID): AppData => touch({ ...d, plans: d.plans.filter((p) => p.id !== id) });

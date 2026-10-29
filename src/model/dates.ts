/**
 * 日付の計算。日付は 'YYYY-MM-DD' の文字列で持ち、計算は「1970-01-01 からの日数」（UTC）で行う。
 * これにより、端末の時差・夏時間・月またぎで日付がずれない。
 *
 * 「稼働日かどうか」（土日の扱い）と「期間の日数」は別の関数に分ける:
 *  - isWorkday / snapForward / snapBackward … 土日を作業日に含めるかどうか
 *  - spanDays … カレンダー上の日数（土日を含む）
 *  - workdays / addWorkdays … 作業日の数
 */
import type { DateStr } from './types';

const DAY = 86_400_000;

export function toDay(d: DateStr): number {
  const [y, m, dd] = d.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, dd) / DAY);
}

export function fromDay(n: number): DateStr {
  const t = new Date(n * DAY);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth() + 1;
  const d = t.getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export const isDateStr = (v: unknown): v is DateStr => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && fromDay(toDay(v)) === v;

/** 端末の暦での今日 */
export function today(now: Date = new Date()): DateStr {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export const addDays = (d: DateStr, n: number): DateStr => fromDay(toDay(d) + n);
export const diffDays = (a: DateStr, b: DateStr): number => toDay(b) - toDay(a);
/** 0 = 日曜 … 6 = 土曜 */
export const weekday = (d: DateStr): number => (((toDay(d) + 4) % 7) + 7) % 7;
export const isWeekend = (d: DateStr): boolean => {
  const w = weekday(d);
  return w === 0 || w === 6;
};

export const isWorkday = (d: DateStr, weekendWork: boolean): boolean => weekendWork || !isWeekend(d);

/** その日が作業日でなければ、次の作業日へ */
export function snapForward(d: DateStr, weekendWork: boolean): DateStr {
  let x = d;
  while (!isWorkday(x, weekendWork)) x = addDays(x, 1);
  return x;
}

/** その日が作業日でなければ、前の作業日へ */
export function snapBackward(d: DateStr, weekendWork: boolean): DateStr {
  let x = d;
  while (!isWorkday(x, weekendWork)) x = addDays(x, -1);
  return x;
}

/** start〜end のカレンダー上の日数（両端を含む） */
export const spanDays = (start: DateStr, end: DateStr): number => toDay(end) - toDay(start) + 1;

/** start〜end の作業日の数（両端を含む）。end < start は 0 */
export function workdays(start: DateStr, end: DateStr, weekendWork: boolean): number {
  const a = toDay(start);
  const b = toDay(end);
  if (b < a) return 0;
  if (weekendWork) return b - a + 1;
  // 7日ごとに5日。端数は1日ずつ数える
  const total = b - a + 1;
  const weeks = Math.floor(total / 7);
  let n = weeks * 5;
  for (let i = a + weeks * 7; i <= b; i++) {
    const w = (((i + 4) % 7) + 7) % 7;
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

/**
 * d から n 作業日進める（n = 0 なら d を作業日に合わせる）。負の n は戻る。
 * 例: 金曜 + 1作業日 = 月曜（土日作業なし）
 */
export function addWorkdays(d: DateStr, n: number, weekendWork: boolean): DateStr {
  if (weekendWork) return addDays(d, n);
  let x = n >= 0 ? snapForward(d, false) : snapBackward(d, false);
  let left = Math.abs(n);
  const step = n >= 0 ? 1 : -1;
  while (left > 0) {
    x = addDays(x, step);
    if (!isWeekend(x)) left--;
  }
  return x;
}

/**
 * バー全体の平行移動。カレンダー上で delta 日ずらし、作業日に合わせたうえで作業日数を保つ。
 * 土日に落ちた場合は、動かした向きの作業日へ寄せる。
 */
export function shiftRange(start: DateStr, end: DateStr, delta: number, weekendWork: boolean): { start: DateStr; end: DateStr } {
  const len = Math.max(1, workdays(start, end, weekendWork));
  const moved = addDays(start, delta);
  const s = delta >= 0 ? snapForward(moved, weekendWork) : snapBackward(moved, weekendWork);
  // 後ろへ戻した結果が元より前の週末をまたいでも、作業日数は同じに保つ
  const startOk = isWorkday(s, weekendWork) ? s : snapForward(s, weekendWork);
  return { start: startOk, end: addWorkdays(startOk, len - 1, weekendWork) };
}

/** 終わりの日を変える（開始より前にはしない。作業日でなければ前の作業日へ） */
export function resizeEnd(start: DateStr, end: DateStr, weekendWork: boolean): DateStr {
  const e = toDay(end) < toDay(start) ? start : end;
  const snapped = snapBackward(e, weekendWork);
  return toDay(snapped) < toDay(start) ? snapForward(start, weekendWork) : snapped;
}

/** 始まりの日を変える（終わりより後にはしない。作業日でなければ次の作業日へ） */
export function resizeStart(start: DateStr, end: DateStr, weekendWork: boolean): DateStr {
  const s = toDay(start) > toDay(end) ? end : start;
  const snapped = snapForward(s, weekendWork);
  return toDay(snapped) > toDay(end) ? snapBackward(end, weekendWork) : snapped;
}

/**
 * 土日作業なしのタスクの期間（開始と期限の両方があるとき）を作業日に合わせる。開始は次の作業日、期限は前の作業日。
 * 期限だけ・開始だけのタスクは、入力した日のまま（締め切りの日付は変えない）。
 */
export function normalizeRange(start: DateStr | null, end: DateStr | null, weekendWork: boolean): { start: DateStr | null; end: DateStr | null } {
  if (weekendWork || !start || !end) return { start, end };
  const s = snapForward(start, false);
  let e = snapBackward(end, false);
  if (toDay(e) < toDay(s)) e = s;
  return { start: s, end: e };
}

/** 作業日の連続区間（土日作業なしなら週末で区切る）。ガントのバーの描画に使う */
export function workRuns(start: DateStr, end: DateStr, weekendWork: boolean): { start: DateStr; end: DateStr }[] {
  if (weekendWork) return [{ start, end }];
  const out: { start: DateStr; end: DateStr }[] = [];
  let cur: { start: DateStr; end: DateStr } | null = null;
  for (let i = toDay(start); i <= toDay(end); i++) {
    const d = fromDay(i);
    if (isWeekend(d)) {
      if (cur) out.push(cur);
      cur = null;
    } else if (cur) cur.end = d;
    else cur = { start: d, end: d };
  }
  if (cur) out.push(cur);
  return out;
}

export function startOfWeek(d: DateStr): DateStr {
  // 月曜はじまり
  const w = weekday(d);
  return addDays(d, w === 0 ? -6 : 1 - w);
}

export function monthOf(d: DateStr): { y: number; m: number } {
  const [y, m] = d.split('-').map(Number);
  return { y, m };
}

export const monthStart = (y: number, m: number): DateStr => `${y}-${String(m).padStart(2, '0')}-01`;

export function addMonths(y: number, m: number, n: number): { y: number; m: number } {
  const t = y * 12 + (m - 1) + n;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const WD = ['日', '月', '火', '水', '木', '金', '土'];
export const weekdayLabel = (d: DateStr): string => WD[weekday(d)];

/** 画面用: 10/30(木) */
export function shortDate(d: DateStr, withWd = true): string {
  const [, m, dd] = d.split('-').map(Number);
  return withWd ? `${m}/${dd}(${weekdayLabel(d)})` : `${m}/${dd}`;
}

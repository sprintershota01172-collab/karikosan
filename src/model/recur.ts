/** 予定の繰り返し: 指定の期間に起きる日を求める */
import { addDays, daysInMonth, isWeekend, toDay, weekday } from './dates';
import type { AppData, CalEvent, DateStr } from './types';

export interface Occurrence {
  event: CalEvent;
  date: DateStr;
  /** 一覧のキー（繰り返しの各回で別） */
  key: string;
}

/** ev が date に起きるか */
export function occursOn(ev: CalEvent, date: DateStr): boolean {
  const d = toDay(date);
  const s = toDay(ev.date);
  if (d < s) return false;
  if (ev.until && d > toDay(ev.until)) return false;
  switch (ev.repeat) {
    case 'none':
      return d === s;
    case 'daily':
      return true;
    case 'weekdays':
      return !isWeekend(date);
    case 'weekly':
      return weekday(date) === weekday(ev.date);
    case 'monthly': {
      // 31日などの月末は、その月の最終日に
      const day = Number(ev.date.slice(8, 10));
      const y = Number(date.slice(0, 4));
      const m = Number(date.slice(5, 7));
      return Number(date.slice(8, 10)) === Math.min(day, daysInMonth(y, m));
    }
  }
}

const timeKey = (e: CalEvent) => (e.startTime ?? '99:99') + (e.endTime ?? '');

/** from〜to（両端含む）の予定を日付・時刻の順に */
export function occurrences(data: AppData, from: DateStr, to: DateStr, vehicle: string | 'all' = 'all'): Occurrence[] {
  const out: Occurrence[] = [];
  const a = toDay(from);
  const b = toDay(to);
  for (const ev of data.events) {
    if (vehicle !== 'all' && ev.vehicleId !== vehicle) continue;
    if (toDay(ev.date) > b || (ev.until && toDay(ev.until) < a)) continue;
    if (ev.repeat === 'none') {
      if (toDay(ev.date) >= a) out.push({ event: ev, date: ev.date, key: ev.id });
      continue;
    }
    for (let i = Math.max(a, toDay(ev.date)); i <= b; i++) {
      const d = addDays('1970-01-01', i);
      if (occursOn(ev, d)) out.push({ event: ev, date: d, key: `${ev.id}@${d}` });
    }
  }
  return out.sort((x, y) => toDay(x.date) - toDay(y.date) || timeKey(x.event).localeCompare(timeKey(y.event)));
}

export const REPEAT_LABEL: Record<CalEvent['repeat'], string> = { none: 'なし', daily: '毎日', weekdays: '平日', weekly: '毎週', monthly: '毎月' };

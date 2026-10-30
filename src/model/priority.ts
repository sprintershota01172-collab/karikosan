/**
 * 優先度。手動で決めていないタスク（priority = 0）は、期限・進捗・残りの作業日から自動で判断する。
 *
 *   余裕（作業日）= 今日から期限までの作業日 − 残りの作業（予定の作業日 ×（1 − 進捗））
 *
 *   至急: 期限を過ぎた・今日が期限・日数が足りない（余裕がマイナス）
 *   高  : 余裕が3日以内（1日未満は「今日進めないと間に合わない」）
 *   中  : 余裕が10日以内
 *   低  : それより先・期限なし
 *
 * 土日作業なしのタスクは土日を作業日に数えない。完了したタスクは優先度を出さない。
 */
import { diffDays, toDay, workdays } from './dates';
import type { DateStr, Priority, Task } from './types';

/** 1 低 / 2 中 / 3 高 / 4 至急 */
export type Level = 1 | 2 | 3 | 4;

export const LEVEL: Record<Level, { label: string; short: string }> = {
  4: { label: '至急', short: '急' },
  3: { label: '高', short: '高' },
  2: { label: '中', short: '中' },
  1: { label: '低', short: '低' },
};

/** 編集画面の選択肢（0 = 自動） */
export const PRIORITY_CHOICES: { v: Priority; label: string }[] = [
  { v: 0, label: '自動' },
  { v: 4, label: '至急' },
  { v: 3, label: '高' },
  { v: 2, label: '中' },
  { v: 1, label: '低' },
];

export interface PriorityInfo {
  /** 0 = 表示しない（完了） */
  level: Level | 0;
  /** 自動で判断したか */
  auto: boolean;
  /** 余裕の作業日（期限がないときは null） */
  slack: number | null;
  /** 判断の理由（編集画面に出す） */
  reason: string;
}

const half = (n: number) => Math.round(n * 2) / 2;
const days = (n: number) => `${half(n)}日`;

/** 自動の判断 */
export function autoPriority(t: Task, today: DateStr): { level: Level; slack: number | null; reason: string } {
  const end = t.due ?? t.start;
  const start = t.start ?? t.due;
  if (!end || !start) return { level: 1, slack: null, reason: '期限が決まっていません' };
  const late = diffDays(end, today);
  if (late > 0) return { level: 4, slack: -late, reason: `期限を${late}日過ぎています` };
  const total = workdays(start, end, t.weekendWork) || 1;
  const need = total * (1 - t.progress / 100);
  const avail = workdays(today, end, t.weekendWork);
  const slack = avail - need;
  const base = `期限まで作業日${avail}日・残りの作業 約${days(need)}（予定${total}日、進捗${t.progress}%）`;
  if (late === 0) return { level: 4, slack, reason: `今日が期限です。${base}` };
  if (slack < 0) return { level: 4, slack, reason: `${base}。${days(-slack)}足りません` };
  if (slack < 1) return { level: 3, slack, reason: `${base}。余裕がありません（今日進めないと間に合いません）` };
  if (slack <= 3) return { level: 3, slack, reason: `${base}。余裕は${days(slack)}` };
  if (slack <= 10) return { level: 2, slack, reason: `${base}。余裕は${days(slack)}` };
  return { level: 1, slack, reason: `${base}。余裕は${days(slack)}` };
}

export function priorityOf(t: Task, today: DateStr): PriorityInfo {
  if (t.done) return { level: 0, auto: t.priority === 0, slack: null, reason: '完了しています' };
  const a = autoPriority(t, today);
  if (t.priority === 0) return { level: a.level, auto: true, slack: a.slack, reason: a.reason };
  return { level: t.priority as Level, auto: false, slack: a.slack, reason: `手動で「${LEVEL[t.priority as Level].label}」にしています（自動なら「${LEVEL[a.level].label}」: ${a.reason}）` };
}

/** 優先度の高い順（同じなら余裕の少ない順 → 期限の近い順） */
export function comparePriority(today: DateStr) {
  const cache = new Map<string, PriorityInfo>();
  const info = (t: Task) => {
    let x = cache.get(t.id);
    if (!x) cache.set(t.id, (x = priorityOf(t, today)));
    return x;
  };
  const k = (d: DateStr | null) => (d ? toDay(d) : Number.MAX_SAFE_INTEGER);
  return (a: Task, b: Task): number => {
    const x = info(a);
    const y = info(b);
    return y.level - x.level || (x.slack ?? Number.MAX_SAFE_INTEGER) - (y.slack ?? Number.MAX_SAFE_INTEGER) || k(a.due) - k(b.due) || a.order - b.order || a.createdAt - b.createdAt;
  };
}

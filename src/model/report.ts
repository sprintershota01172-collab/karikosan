/**
 * 状況報告。
 *  - その時点のタスクの状況を写し取って保存する（あとでタスクを変えても、過去の報告は変わらない）
 *  - 同じ日・同じ対象の報告がすでにあれば、状況だけ取り直す（課題・所感は残す）
 *  - 新しい報告には、前回の報告の「対応中」の課題を引き継ぐ
 *  - 前回との差（進捗・遅れ・完了数）と、前回からの完了を出す
 */
import { addDays, toDay } from './dates';
import { priorityOf } from './priority';
import { buildRows, isOverdue, statsOf } from './rows';
import { uid } from './schema';
import type { AppData, DateStr, ID, Report, ReportIssue, ReportRow } from './types';

const NAVY = '#19283B';

/** 報告の対象（車種 or すべて）の名前 */
export const scopeName = (d: AppData, vehicleId: ID | 'all'): string => (vehicleId === 'all' ? 'すべて' : d.vehicles.find((v) => v.id === vehicleId)?.name ?? '（削除した車種）');

/** タスクの状況をアプリと同じ並び（車種 → グループ → 子ツリー → タスク）で写し取る。折りたたみは無視してすべて出す */
export function snapshotRows(d: AppData, vehicleId: ID | 'all', day: DateStr): ReportRow[] {
  const open: AppData = { ...d, groups: d.groups.map((g) => ({ ...g, collapsed: false })), settings: { ...d.settings, collapsedV: [] } };
  const rows = buildRows(open, { vehicle: vehicleId, sortMode: 'manual', showDone: true, status: 'all', assignee: null, query: '', today: day });
  const gById = new Map(d.groups.map((g) => [g.id, g]));
  const out: ReportRow[] = [];
  const base = { start: null, due: null, progress: 0, done: false, doneAt: null, level: 0, assignee: '', where: '', total: 0, doneCount: 0, overdue: 0 };
  for (const r of rows) {
    if (r.kind === 'vehicle' || r.kind === 'pinned') {
      const s = r.stats;
      out.push({ ...base, kind: 'v', depth: 0, title: r.kind === 'pinned' ? '固定したグループ' : r.vehicle?.name ?? '車種なし', color: r.kind === 'pinned' ? NAVY : r.vehicle?.color ?? '#9299A3', start: s.start, due: s.end, progress: s.progress, total: s.total, doneCount: s.done, overdue: s.overdue });
    } else if (r.kind === 'group') {
      const s = r.stats;
      out.push({ ...base, kind: 'g', depth: r.depth + (vehicleId === 'all' ? 1 : 0), title: r.group.name, color: r.vehicle?.color ?? NAVY, start: s.start, due: s.end, progress: s.progress, total: s.total, doneCount: s.done, overdue: s.overdue });
    } else if (r.kind === 'task') {
      const t = r.task;
      const g = t.groupId ? gById.get(t.groupId) : null;
      const p = g?.parentId ? gById.get(g.parentId) : null;
      const where = [r.vehicle?.name, p?.name, g?.name].filter(Boolean).join(' › ');
      out.push({
        ...base,
        kind: 't',
        depth: r.depth + (vehicleId === 'all' ? 1 : 0),
        title: t.title || '無題',
        color: r.vehicle?.color ?? '#3D7469',
        start: t.start ?? t.due,
        due: t.due ?? t.start,
        progress: t.done ? 100 : t.progress,
        done: t.done,
        doneAt: t.doneAt,
        level: priorityOf(t, day).level,
        assignee: t.assignee,
        where,
        overdue: isOverdue(t, day) ? 1 : 0,
      });
    }
  }
  return out;
}

/** 報告の数字（対象のタスク全体） */
export function reportStats(d: AppData, vehicleId: ID | 'all', day: DateStr) {
  const tasks = d.tasks.filter((t) => vehicleId === 'all' || t.vehicleId === vehicleId);
  const s = statsOf(tasks, day);
  const soonEnd = toDay(addDays(day, 7));
  const soon = tasks.filter((t) => !t.done && t.due && toDay(t.due) >= toDay(day) && toDay(t.due) <= soonEnd).length;
  return { total: s.total, done: s.done, overdue: s.overdue, soon, progress: s.progress };
}

/** 保存しない報告（ガントからの Excel 出力・作成前の確認用） */
export function draftReport(d: AppData, vehicleId: ID | 'all', day: DateStr): Report {
  const now = Date.now();
  return { id: 'draft', date: day, createdAt: now, updatedAt: now, vehicleId, scope: scopeName(d, vehicleId), ...reportStats(d, vehicleId, day), rows: snapshotRows(d, vehicleId, day), issues: [], note: '' };
}

/** 前の報告（同じ対象で、この報告より前のもの。なければ対象に関係なく前のもの） */
export function previousReport(reports: Report[], r: Pick<Report, 'id' | 'date' | 'createdAt' | 'vehicleId'>): Report | null {
  const before = reports.filter((x) => x.id !== r.id && (x.date < r.date || (x.date === r.date && x.createdAt < r.createdAt)));
  return before.find((x) => x.vehicleId === r.vehicleId) ?? null;
}

/**
 * ワンタップの報告作成。同じ日・同じ対象の報告があれば状況を取り直す（課題・所感は残す）。
 * 新しく作るときは、前回の「対応中」の課題を引き継ぐ。
 */
export function createReport(d: AppData, vehicleId: ID | 'all', day: DateStr): { data: AppData; report: Report; updated: boolean } {
  const now = Date.now();
  const same = d.reports.find((r) => r.date === day && r.vehicleId === vehicleId);
  const snap = { scope: scopeName(d, vehicleId), ...reportStats(d, vehicleId, day), rows: snapshotRows(d, vehicleId, day) };
  if (same) {
    const report: Report = { ...same, ...snap, updatedAt: now };
    return { data: { ...d, reports: d.reports.map((r) => (r.id === same.id ? report : r)), updatedAt: now }, report, updated: true };
  }
  const prev = previousReport(d.reports, { id: '', date: day, createdAt: now, vehicleId });
  const carried: ReportIssue[] = (prev?.issues ?? []).filter((i) => i.status === 'open').map((i) => ({ ...i }));
  const report: Report = { id: uid('r'), date: day, createdAt: now, updatedAt: now, vehicleId, ...snap, issues: carried, note: '' };
  const reports = [report, ...d.reports].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  return { data: { ...d, reports, updatedAt: now }, report, updated: false };
}

export function updateReport(d: AppData, id: ID, patch: Partial<Pick<Report, 'issues' | 'note'>>): AppData {
  const now = Date.now();
  return { ...d, reports: d.reports.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: now } : r)), updatedAt: now };
}

export const deleteReport = (d: AppData, id: ID): AppData => ({ ...d, reports: d.reports.filter((r) => r.id !== id), updatedAt: Date.now() });

export const addIssue = (d: AppData, id: ID, text: string): AppData => {
  const r = d.reports.find((x) => x.id === id);
  if (!r || !text.trim()) return d;
  return updateReport(d, id, { issues: [...r.issues, { id: uid('i'), text: text.trim(), status: 'open', since: r.date }] });
};
export const setIssue = (d: AppData, id: ID, issueId: ID, patch: Partial<Pick<ReportIssue, 'text' | 'status'>>): AppData => {
  const r = d.reports.find((x) => x.id === id);
  if (!r) return d;
  return updateReport(d, id, { issues: r.issues.map((i) => (i.id === issueId ? { ...i, ...patch } : i)) });
};
export const removeIssue = (d: AppData, id: ID, issueId: ID): AppData => {
  const r = d.reports.find((x) => x.id === id);
  if (!r) return d;
  return updateReport(d, id, { issues: r.issues.filter((i) => i.id !== issueId) });
};

/** 報告の中身（画面と Excel で共通） */
export interface ReportView {
  overdue: ReportRow[];
  /** 14日以内の期限（未完了。期限の近い順） */
  upcoming: ReportRow[];
  /** 前回の報告から今回までに完了したもの（前回がなければ7日以内） */
  doneSince: ReportRow[];
  vehicles: ReportRow[];
  prev: Report | null;
  /** 前回との差（前回がなければ null） */
  delta: { progress: number; done: number; overdue: number } | null;
  /** 前回の課題（前回の報告に書いた課題と、今回の状態） */
  prevIssues: { text: string; was: 'open' | 'closed'; now: 'open' | 'closed' | 'gone' }[];
}

export function viewOf(r: Report, reports: Report[]): ReportView {
  const tasks = r.rows.filter((x) => x.kind === 't');
  const day = toDay(r.date);
  const prev = previousReport(reports, r);
  const since = prev ? prev.createdAt : r.createdAt - 7 * 86400_000;
  const byDue = (a: ReportRow, b: ReportRow) => (a.due ?? '9').localeCompare(b.due ?? '9');
  return {
    overdue: tasks.filter((t) => t.overdue).sort(byDue),
    upcoming: tasks.filter((t) => !t.done && !t.overdue && t.due && toDay(t.due) - day <= 14).sort(byDue),
    doneSince: tasks.filter((t) => t.done && t.doneAt != null && t.doneAt > since && t.doneAt <= r.createdAt).sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0)),
    vehicles: r.rows.filter((x) => x.kind === 'v'),
    prev,
    delta: prev ? { progress: r.progress - prev.progress, done: r.done - prev.done, overdue: r.overdue - prev.overdue } : null,
    prevIssues: (prev?.issues ?? []).map((i) => {
      const cur = r.issues.find((x) => x.id === i.id);
      return { text: i.text, was: i.status, now: cur ? cur.status : 'gone' };
    }),
  };
}

/** 遅れの日数 */
export const lateDays = (row: ReportRow, date: DateStr): number => (row.due ? Math.max(0, toDay(date) - toDay(row.due)) : 0);

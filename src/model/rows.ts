/**
 * 一覧とガントで共通の「行」。タスク一覧・ガントの名前列・ガントのバーは、すべてこの行の配列から描く。
 * 並び順・表示/非表示・集約（件数・完了率・期間）をここで1回だけ計算する。
 *
 *   車種（すべて表示のとき） → グループ → 子ツリー → タスク
 */
import { addDays, startOfWeek, today as todayStr, toDay } from './dates';
import { comparePriority, priorityOf, type Level } from './priority';
import type { AppData, DateStr, Group, ID, SortMode, Task, Vehicle } from './types';

export interface Stats {
  total: number;
  done: number;
  overdue: number;
  /** 完了は100%、未完了は進捗率で平均（0〜100） */
  progress: number;
  start: DateStr | null;
  end: DateStr | null;
}

export type Row =
  /** open: 中身を出しているか（大項目の折りたたみ） */
  | { kind: 'vehicle'; key: string; vehicle: Vehicle | null; stats: Stats; open: boolean }
  | { kind: 'pinned'; key: string; stats: Stats; open: boolean }
  /** open: 中身を出しているか（絞り込み中は折りたたんでいても該当するタスクを出す） */
  | { kind: 'group'; key: string; group: Group; depth: 0 | 1; stats: Stats; vehicle: Vehicle | null; open: boolean }
  /** 優先度別の見出し（level 0 = 完了） */
  | { kind: 'prio'; key: string; level: Level | 0; stats: Stats }
  /** where: 優先度別のときに出す「車種・グループ」 */
  | { kind: 'task'; key: string; task: Task; depth: 0 | 1 | 2; container: string; vehicle: Vehicle | null; where?: string };

export type StatusFilter = 'all' | 'open' | 'done' | 'overdue' | 'today' | 'week' | 'urgent';

export interface ViewOpts {
  vehicle: ID | 'all';
  sortMode: SortMode;
  showDone: boolean;
  status: StatusFilter;
  assignee: string | null;
  query: string;
  today: DateStr;
}

/** 並べ替えの単位（同じ container のタスク同士で並べ替える） */
export const containerOf = (t: Pick<Task, 'groupId' | 'vehicleId'>): string => (t.groupId ? `g:${t.groupId}` : `v:${t.vehicleId ?? '-'}`);

export const isOverdue = (t: Task, today: DateStr): boolean => !t.done && !!t.due && toDay(t.due) < toDay(today);

/** 今日のタスクの対象（期限切れ・今日が期限・期間中） */
export function isTodayTask(t: Task, today: DateStr): boolean {
  if (t.done) return false;
  const d = toDay(today);
  if (t.due && toDay(t.due) <= d) return true;
  if (t.start && toDay(t.start) <= d && (!t.due || toDay(t.due) >= d)) return true;
  return false;
}

export function inWeek(t: Task, today: DateStr): boolean {
  const a = toDay(startOfWeek(today));
  const b = a + 6;
  const s = t.start ? toDay(t.start) : t.due ? toDay(t.due) : null;
  const e = t.due ? toDay(t.due) : s;
  if (s == null || e == null) return false;
  return s <= b && e >= a;
}

export function matchStatus(t: Task, f: StatusFilter, today: DateStr): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'open':
      return !t.done;
    case 'done':
      return t.done;
    case 'overdue':
      return isOverdue(t, today);
    case 'today':
      return isTodayTask(t, today);
    case 'week':
      return !t.done && inWeek(t, today);
    case 'urgent':
      return priorityOf(t, today).level >= 3;
  }
}

const norm = (s: string) => s.normalize('NFKC').toLowerCase();

export function matchQuery(t: Task, q: string, groupName: string, vehicleName: string): boolean {
  if (!q.trim()) return true;
  const hay = norm(`${t.title} ${t.memo} ${t.assignee} ${groupName} ${vehicleName}`);
  return norm(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/** 同じ container 内のタスクの並び（手動 = order、期限順 = 期限→開始→order、優先順 = 優先度→余裕→期限） */
export function sortTasks(list: Task[], mode: SortMode, today: DateStr = todayStr()): Task[] {
  const a = [...list];
  if (mode === 'manual') return a.sort((x, y) => x.order - y.order || x.createdAt - y.createdAt);
  if (mode === 'priority') return a.sort(comparePriority(today));
  const k = (d: DateStr | null) => (d ? toDay(d) : Number.MAX_SAFE_INTEGER);
  return a.sort((x, y) => k(x.due) - k(y.due) || k(x.start) - k(y.start) || x.order - y.order || x.createdAt - y.createdAt);
}

export const sortGroups = (list: Group[]): Group[] => [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order);

export function statsOf(tasks: Task[], today: DateStr): Stats {
  let done = 0;
  let overdue = 0;
  let prog = 0;
  let s: number | null = null;
  let e: number | null = null;
  for (const t of tasks) {
    if (t.done) done++;
    if (isOverdue(t, today)) overdue++;
    prog += t.done ? 100 : t.progress;
    const ts = t.start ?? t.due;
    const te = t.due ?? t.start;
    if (ts) s = s == null ? toDay(ts) : Math.min(s, toDay(ts));
    if (te) e = e == null ? toDay(te) : Math.max(e, toDay(te));
  }
  const from = (n: number | null) => (n == null ? null : addDays('1970-01-01', n));
  return { total: tasks.length, done, overdue, progress: tasks.length ? Math.round(prog / tasks.length) : 0, start: from(s), end: from(e) };
}

/** グループ（子ツリーを含む）に属するタスク */
export function tasksUnder(data: AppData, groupId: ID): Task[] {
  const kids = new Set([groupId, ...data.groups.filter((g) => g.parentId === groupId).map((g) => g.id)]);
  return data.tasks.filter((t) => t.groupId != null && kids.has(t.groupId));
}

/**
 * 表示する行を作る。絞り込み中は該当するタスクがないグループを出さない（空の枠を並べない）。
 * 折りたたんだグループは見出しだけ（絞り込み中は、該当するタスクを折りたたみに関係なく出す）。
 */
export function buildRows(data: AppData, o: ViewOpts): Row[] {
  const vById = new Map(data.vehicles.map((v) => [v.id, v]));
  const gById = new Map(data.groups.map((g) => [g.id, g]));
  const filtering = o.status !== 'all' || !!o.assignee || !!o.query.trim();
  const visible = (t: Task) => {
    if (!o.showDone && t.done && o.status !== 'done') return false;
    if (!matchStatus(t, o.status, o.today)) return false;
    if (o.assignee && t.assignee !== o.assignee) return false;
    const g = t.groupId ? gById.get(t.groupId) : null;
    const p = g?.parentId ? gById.get(g.parentId) : null;
    const v = t.vehicleId ? vById.get(t.vehicleId) : null;
    return matchQuery(t, o.query, `${p?.name ?? ''} ${g?.name ?? ''}`, v?.name ?? '');
  };
  const shown = data.tasks.filter(visible);
  const byContainer = new Map<string, Task[]>();
  for (const t of shown) {
    const k = containerOf(t);
    if (!byContainer.has(k)) byContainer.set(k, []);
    byContainer.get(k)!.push(t);
  }
  const tasksOf = (k: string) => sortTasks(byContainer.get(k) ?? [], o.sortMode, o.today);
  const allUnder = (gid: ID) => tasksUnder(data, gid).filter(visible);

  const rows: Row[] = [];

  // 優先度別: 車種・グループに関係なく 至急 → 高 → 中 → 低 → 完了 に分ける（並べ替えはできない。順番は自動）
  if (o.sortMode === 'priority') {
    const by = new Map<number, Task[]>();
    for (const t of shown) {
      if (o.vehicle !== 'all' && t.vehicleId !== o.vehicle) continue;
      const lv = priorityOf(t, o.today).level;
      if (!by.has(lv)) by.set(lv, []);
      by.get(lv)!.push(t);
    }
    const cmp = comparePriority(o.today);
    for (const lv of [4, 3, 2, 1, 0] as const) {
      const list = (by.get(lv) ?? []).sort(lv === 0 ? (a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0) : cmp);
      if (!list.length) continue;
      rows.push({ kind: 'prio', key: `p:${lv}`, level: lv, stats: statsOf(list, o.today) });
      for (const t of list) {
        const g = t.groupId ? gById.get(t.groupId) : null;
        const p = g?.parentId ? gById.get(g.parentId) : null;
        const v = t.vehicleId ? vById.get(t.vehicleId) ?? null : null;
        const where = [o.vehicle === 'all' ? v?.name : '', p?.name, g?.name].filter(Boolean).join(' › ');
        rows.push({ kind: 'task', key: t.id, task: t, depth: 0, container: `p:${lv}`, vehicle: v, where });
      }
    }
    return rows;
  }

  const pushGroup = (g: Group, vehicle: Vehicle | null) => {
    const under = allUnder(g.id);
    const kids = sortGroups(data.groups.filter((x) => x.parentId === g.id));
    if (filtering && under.length === 0) return;
    const open = !g.collapsed || filtering;
    rows.push({ kind: 'group', key: `g:${g.id}`, group: g, depth: 0, stats: statsOf(under, o.today), vehicle, open });
    if (!open) return;
    for (const t of tasksOf(`g:${g.id}`)) rows.push({ kind: 'task', key: t.id, task: t, depth: 1, container: `g:${g.id}`, vehicle });
    for (const c of kids) {
      const cu = tasksOf(`g:${c.id}`);
      if (filtering && cu.length === 0) continue;
      const copen = !c.collapsed || filtering;
      rows.push({ kind: 'group', key: `g:${c.id}`, group: c, depth: 1, stats: statsOf(cu, o.today), vehicle, open: copen });
      if (!copen) continue;
      for (const t of cu) rows.push({ kind: 'task', key: t.id, task: t, depth: 2, container: `g:${c.id}`, vehicle });
    }
  };
  const vehicleSection = (vid: ID | null, withHeader: boolean, skipPinned: boolean) => {
    const vehicle = vid ? vById.get(vid) ?? null : null;
    const loose = tasksOf(`v:${vid ?? '-'}`);
    const groups = sortGroups(data.groups.filter((g) => g.parentId == null && g.vehicleId === vid && !(skipPinned && g.pinned)));
    const all = shown.filter((t) => t.vehicleId === vid);
    if (withHeader) {
      if (filtering && all.length === 0) return;
      if (!filtering && all.length === 0 && groups.length === 0 && vid == null) return;
      const open = filtering || !data.settings.collapsedV.includes(vid ?? '-');
      rows.push({ kind: 'vehicle', key: `v:${vid ?? '-'}`, vehicle, stats: statsOf(data.tasks.filter((t) => t.vehicleId === vid && visible(t)), o.today), open });
      if (!open) return;
    }
    for (const t of loose) rows.push({ kind: 'task', key: t.id, task: t, depth: 0, container: `v:${vid ?? '-'}`, vehicle });
    for (const g of groups) pushGroup(g, vehicle);
  };

  if (o.vehicle === 'all') {
    // 固定したグループは、車種をまたいで一番上に
    const pinned = sortGroups(data.groups.filter((g) => g.parentId == null && g.pinned));
    const pinnedTasks = pinned.flatMap((g) => allUnder(g.id));
    if (pinned.length && (!filtering || pinnedTasks.length)) {
      const open = filtering || !data.settings.collapsedV.includes('pinned');
      rows.push({ kind: 'pinned', key: 'pinned', stats: statsOf(pinnedTasks, o.today), open });
      if (open) for (const g of pinned) pushGroup(g, g.vehicleId ? vById.get(g.vehicleId) ?? null : null);
    }
    for (const v of [...data.vehicles].sort((a, b) => a.order - b.order)) vehicleSection(v.id, true, true);
    vehicleSection(null, true, true);
  } else {
    vehicleSection(o.vehicle, false, false);
  }
  return rows;
}

/** 今日のタスク（優先度の高い順。同じなら余裕の少ない順 → 期限の近い順）。除外したものは別に返す */
export function todayList(data: AppData, today: DateStr): { list: Task[]; hidden: Task[] } {
  const cands = data.tasks.filter((t) => isTodayTask(t, today)).sort(comparePriority(today));
  return { list: cands.filter((t) => !t.hiddenOn.includes(today)), hidden: cands.filter((t) => t.hiddenOn.includes(today)) };
}

/** 担当者の一覧（入力済みのもの） */
export const assignees = (data: AppData): string[] => [...new Set(data.tasks.map((t) => t.assignee.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));

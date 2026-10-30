/**
 * データを変える操作。すべて「元のデータを変えずに新しいデータを返す」純粋な関数にして、
 * 画面（store）からもテストからも同じ関数を使う。
 */
import { addWorkdays, normalizeRange, today as todayStr, toDay } from './dates';
import { containerOf, sortTasks } from './rows';
import { newEvent, newTask, uid, VEHICLE_COLORS } from './schema';
import type { AppData, CalEvent, Checklist, DateStr, Group, ID, Settings, Task, Vehicle } from './types';

const touch = (d: AppData): AppData => ({ ...d, updatedAt: Date.now() });
const maxOrder = (xs: { order: number }[]) => xs.reduce((m, x) => Math.max(m, x.order), -1);

/* ---------- タスク ---------- */

export function addTask(d: AppData, p: Partial<Task> & { title: string }): { data: AppData; task: Task } {
  let vehicleId = p.vehicleId ?? null;
  if (p.groupId) vehicleId = d.groups.find((g) => g.id === p.groupId)?.vehicleId ?? vehicleId;
  const container = containerOf({ groupId: p.groupId ?? null, vehicleId });
  const order = maxOrder(d.tasks.filter((t) => containerOf(t) === container)) + 1;
  const range = normalizeRange(p.start ?? null, p.due ?? null, p.weekendWork ?? false);
  const task = newTask({ ...p, vehicleId, order, start: range.start, due: range.end });
  return { data: touch({ ...d, tasks: [...d.tasks, task] }), task };
}

export function updateTask(d: AppData, id: ID, patch: Partial<Task>): AppData {
  const cur = d.tasks.find((t) => t.id === id);
  if (!cur) return d;
  let next: Task = { ...cur, ...patch, updatedAt: Date.now() };
  if ('groupId' in patch && patch.groupId !== cur.groupId) {
    if (next.groupId) next.vehicleId = d.groups.find((g) => g.id === next.groupId)?.vehicleId ?? null;
  }
  if ('vehicleId' in patch && patch.vehicleId !== cur.vehicleId && !('groupId' in patch)) {
    // 車種を変えたら、別の車種のグループからは外す
    const g = next.groupId ? d.groups.find((x) => x.id === next.groupId) : null;
    if (g && g.vehicleId !== next.vehicleId) next.groupId = null;
  }
  if (containerOf(next) !== containerOf(cur)) next.order = maxOrder(d.tasks.filter((t) => t.id !== id && containerOf(t) === containerOf(next))) + 1;
  if ('done' in patch && patch.done !== cur.done) next.doneAt = patch.done ? Date.now() : null;
  const range = normalizeRange(next.start, next.due, next.weekendWork);
  next = { ...next, start: range.start, due: range.end };
  next.progress = Math.max(0, Math.min(100, Math.round(next.progress)));
  return touch({ ...d, tasks: d.tasks.map((t) => (t.id === id ? next : t)) });
}

export const setDone = (d: AppData, id: ID, done: boolean): AppData => updateTask(d, id, { done });

export function deleteTasks(d: AppData, ids: ID[]): AppData {
  const s = new Set(ids);
  return touch({ ...d, tasks: d.tasks.filter((t) => !s.has(t.id)) });
}

/** 期限順で表示している並びを、そのまま手動の順番として保存する（切り替えても見た目が変わらない） */
export function freezeOrder(d: AppData): AppData {
  const by = new Map<string, Task[]>();
  for (const t of d.tasks) {
    const k = containerOf(t);
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(t);
  }
  const order = new Map<ID, number>();
  for (const list of by.values()) sortTasks(list, d.settings.sortMode).forEach((t, i) => order.set(t.id, i));
  return { ...d, tasks: d.tasks.map((t) => ({ ...t, order: order.get(t.id) ?? t.order })) };
}

/**
 * 並べ替え。visibleIds = 画面に出ている同じ container のタスクの、並べ替え後の順番。
 * 出ていないタスク（完了の非表示・絞り込み）の相対位置は保つ。
 * 期限順のときは、いまの見た目の順を手動の順にしてから動かし、手動に切り替える。
 */
export function reorder(d: AppData, container: string, visibleIds: ID[]): { data: AppData; switched: boolean } {
  const switched = d.settings.sortMode !== 'manual';
  let base = switched ? freezeOrder(d) : d;
  const all = sortTasks(base.tasks.filter((t) => containerOf(t) === container), 'manual');
  const vis = new Set(visibleIds);
  // 見えていないタスクは、直前の見えているタスクにくっつけて一緒に動かす（先頭の分はそのまま先頭）
  const lead: string[] = [];
  const blocks = new Map<string, string[]>();
  let cur: string[] = lead;
  for (const t of all) {
    if (vis.has(t.id)) {
      cur = [t.id];
      blocks.set(t.id, cur);
    } else cur.push(t.id);
  }
  const merged = [...lead, ...visibleIds.filter((id) => blocks.has(id)).flatMap((id) => blocks.get(id)!)];
  for (const t of all) if (!merged.includes(t.id)) merged.push(t.id);
  const order = new Map(merged.map((id, i) => [id, i]));
  base = { ...base, tasks: base.tasks.map((t) => (order.has(t.id) ? { ...t, order: order.get(t.id)! } : t)) };
  if (switched) base = { ...base, settings: { ...base.settings, sortMode: 'manual' } };
  return { data: touch(base), switched };
}

/** ガントで期間を変える */
export function setTaskRange(d: AppData, id: ID, start: DateStr, due: DateStr): AppData {
  return updateTask(d, id, { start, due });
}

/** 今日のタスクから外す／戻す */
export function hideToday(d: AppData, id: ID, day: DateStr = todayStr()): AppData {
  return touch({ ...d, tasks: d.tasks.map((t) => (t.id === id && !t.hiddenOn.includes(day) ? { ...t, hiddenOn: [...t.hiddenOn.filter((x) => toDay(x) >= toDay(day) - 30), day] } : t)) });
}
export function unhideToday(d: AppData, id: ID, day: DateStr = todayStr()): AppData {
  return touch({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, hiddenOn: t.hiddenOn.filter((x) => x !== day) } : t)) });
}

/** 延期: 期限を次の作業日へ（期限がなければ今日の次の作業日。開始が期限を越えるなら開始も） */
export function postpone(d: AppData, id: ID, day: DateStr = todayStr()): AppData {
  const t = d.tasks.find((x) => x.id === id);
  if (!t) return d;
  const base = t.due && toDay(t.due) >= toDay(day) ? t.due : day;
  const due = addWorkdays(base, 1, t.weekendWork);
  const start = t.start && toDay(t.start) > toDay(due) ? due : t.start;
  return updateTask(d, id, { due, start });
}

/* ---------- 車種 ---------- */

export function addVehicle(d: AppData, name: string): { data: AppData; vehicle: Vehicle } {
  const vehicle: Vehicle = { id: uid('v'), name: name.trim() || '車種', color: VEHICLE_COLORS[d.vehicles.length % VEHICLE_COLORS.length], order: maxOrder(d.vehicles) + 1 };
  return { data: touch({ ...d, vehicles: [...d.vehicles, vehicle] }), vehicle };
}
export const updateVehicle = (d: AppData, id: ID, patch: Partial<Vehicle>): AppData => touch({ ...d, vehicles: d.vehicles.map((v) => (v.id === id ? { ...v, ...patch, id } : v)) });

/** 車種を消す。タスク・グループ・予定は消さずに「車種なし」へ移す */
export function deleteVehicle(d: AppData, id: ID): AppData {
  return touch({
    ...d,
    vehicles: d.vehicles.filter((v) => v.id !== id),
    groups: d.groups.map((g) => (g.vehicleId === id ? { ...g, vehicleId: null } : g)),
    tasks: d.tasks.map((t) => (t.vehicleId === id ? { ...t, vehicleId: null } : t)),
    events: d.events.map((e) => (e.vehicleId === id ? { ...e, vehicleId: null } : e)),
    settings: d.settings.vehicle === id ? { ...d.settings, vehicle: 'all' } : d.settings,
  });
}

export function moveVehicle(d: AppData, id: ID, dir: -1 | 1): AppData {
  const list = [...d.vehicles].sort((a, b) => a.order - b.order);
  const i = list.findIndex((v) => v.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return d;
  [list[i], list[j]] = [list[j], list[i]];
  const order = new Map(list.map((v, k) => [v.id, k]));
  return touch({ ...d, vehicles: d.vehicles.map((v) => ({ ...v, order: order.get(v.id)! })) });
}

/* ---------- グループ・子ツリー ---------- */

export function addGroup(d: AppData, p: { name: string; vehicleId: ID | null; parentId?: ID | null }): { data: AppData; group: Group } {
  const parent = p.parentId ? d.groups.find((g) => g.id === p.parentId) : null;
  // 子ツリーは1段まで
  const parentId = parent ? parent.parentId ?? parent.id : null;
  const vehicleId = parent ? parent.vehicleId : p.vehicleId;
  const siblings = d.groups.filter((g) => g.parentId === parentId && g.vehicleId === vehicleId);
  const group: Group = { id: uid('g'), vehicleId, parentId, name: p.name.trim() || (parentId ? '子ツリー' : 'グループ'), order: maxOrder(siblings) + 1, pinned: false, collapsed: false };
  // 追加した枠を開く（親を折りたたんでいたら親も開く。1つずつ開く設定なら、ほかは閉じる）
  return { data: setGroupOpen({ ...d, groups: [...d.groups, group] }, group.id, true), group };
}

export const updateGroup = (d: AppData, id: ID, patch: Partial<Pick<Group, 'name' | 'pinned' | 'collapsed'>>): AppData => touch({ ...d, groups: d.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) });

/**
 * グループを開く・閉じる。「グループは1つずつ開く」のときは、開いたグループと同じ段のほかのグループを閉じる
 * （最上位のグループは車種をまたいで1つだけ、子ツリーは同じ親の中で1つだけ）。子ツリーを開くときは親も開く。
 */
export function setGroupOpen(d: AppData, id: ID, open: boolean): AppData {
  const g = d.groups.find((x) => x.id === id);
  if (!g) return d;
  if (!open) return g.collapsed ? d : updateGroup(d, id, { collapsed: true });
  let next = g.parentId ? setGroupOpen(d, g.parentId, true) : d;
  const one = d.settings.oneGroup;
  next = { ...next, groups: next.groups.map((x) => (x.id === id ? { ...x, collapsed: false } : one && x.parentId === g.parentId && !x.collapsed ? { ...x, collapsed: true } : x)) };
  return touch(next);
}

/** グループを消す。中のタスクは消さずに親（子ツリーなら親グループ、グループなら車種の直下）へ移す */
export function deleteGroup(d: AppData, id: ID): AppData {
  const g = d.groups.find((x) => x.id === id);
  if (!g) return d;
  const childIds = new Set(d.groups.filter((x) => x.parentId === id).map((x) => x.id));
  const target = g.parentId ?? null;
  let next = { ...d, groups: d.groups.filter((x) => x.id !== id && !childIds.has(x.id)) };
  const moved = d.tasks.filter((t) => t.groupId === id || (t.groupId && childIds.has(t.groupId)));
  const container = containerOf({ groupId: target, vehicleId: g.vehicleId });
  let o = maxOrder(d.tasks.filter((t) => containerOf(t) === container)) + 1;
  const newOrder = new Map(sortTasks(moved, 'manual').map((t) => [t.id, o++]));
  next = { ...next, tasks: d.tasks.map((t) => (newOrder.has(t.id) ? { ...t, groupId: target, vehicleId: g.vehicleId, order: newOrder.get(t.id)! } : t)) };
  return touch(next);
}

export function moveGroup(d: AppData, id: ID, dir: -1 | 1): AppData {
  const g = d.groups.find((x) => x.id === id);
  if (!g) return d;
  const list = d.groups.filter((x) => x.parentId === g.parentId && x.vehicleId === g.vehicleId).sort((a, b) => a.order - b.order);
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= list.length) return d;
  [list[i], list[j]] = [list[j], list[i]];
  const order = new Map(list.map((x, k) => [x.id, k]));
  return touch({ ...d, groups: d.groups.map((x) => (order.has(x.id) ? { ...x, order: order.get(x.id)! } : x)) });
}

/* ---------- 予定 ---------- */

export function addEvent(d: AppData, p: Partial<CalEvent> & { title: string; date: string }): { data: AppData; event: CalEvent } {
  const event = newEvent(p);
  return { data: touch({ ...d, events: [...d.events, event] }), event };
}
export const updateEvent = (d: AppData, id: ID, patch: Partial<CalEvent>): AppData => touch({ ...d, events: d.events.map((e) => (e.id === id ? { ...e, ...patch, id, updatedAt: Date.now() } : e)) });
export const deleteEvent = (d: AppData, id: ID): AppData => touch({ ...d, events: d.events.filter((e) => e.id !== id) });

/* ---------- チェックリスト ---------- */

export function addChecklist(d: AppData, name: string, firstItem?: string): { data: AppData; list: Checklist } {
  const list: Checklist = { id: uid('c'), name: name.trim() || 'リスト', order: maxOrder(d.checklists) + 1, collapsed: false, items: firstItem?.trim() ? [{ id: uid('ci'), text: firstItem.trim(), done: false, order: 0 }] : [] };
  return { data: touch({ ...d, checklists: [...d.checklists, list] }), list };
}
const mapList = (d: AppData, id: ID, fn: (c: Checklist) => Checklist): AppData => touch({ ...d, checklists: d.checklists.map((c) => (c.id === id ? fn(c) : c)) });
export const renameChecklist = (d: AppData, id: ID, name: string) => mapList(d, id, (c) => ({ ...c, name }));
export const toggleChecklist = (d: AppData, id: ID) => mapList(d, id, (c) => ({ ...c, collapsed: !c.collapsed }));
export const deleteChecklist = (d: AppData, id: ID): AppData => touch({ ...d, checklists: d.checklists.filter((c) => c.id !== id) });
export const addCheckItem = (d: AppData, id: ID, text: string) =>
  mapList(d, id, (c) => ({ ...c, collapsed: false, items: [...c.items, { id: uid('ci'), text: text.trim(), done: false, order: maxOrder(c.items) + 1 }] }));
export const toggleCheckItem = (d: AppData, listId: ID, itemId: ID) => mapList(d, listId, (c) => ({ ...c, items: c.items.map((x) => (x.id === itemId ? { ...x, done: !x.done } : x)) }));
export const deleteCheckItem = (d: AppData, listId: ID, itemId: ID) => mapList(d, listId, (c) => ({ ...c, items: c.items.filter((x) => x.id !== itemId) }));

/** 項目の並べ替え・別のリストへの移動（toIds = 移動先リストの並べ替え後の順番） */
export function moveCheckItem(d: AppData, itemId: ID, toList: ID, toIds: ID[]): AppData {
  const from = d.checklists.find((c) => c.items.some((x) => x.id === itemId));
  if (!from) return d;
  const item = from.items.find((x) => x.id === itemId)!;
  return touch({
    ...d,
    checklists: d.checklists.map((c) => {
      let items = c.id === from.id ? c.items.filter((x) => x.id !== itemId) : c.items;
      if (c.id === toList) {
        const all = new Map([...items, item].map((x) => [x.id, x]));
        items = toIds.filter((id) => all.has(id)).map((id, i) => ({ ...all.get(id)!, order: i }));
      }
      return { ...c, items };
    }),
  });
}

/* ---------- 設定 ---------- */

export const setSettings = (d: AppData, patch: Partial<Settings>): AppData => ({ ...d, settings: { ...d.settings, ...patch }, updatedAt: Date.now() });

/** 「グループは1つずつ開く」の切り替え。オンにしたときは、表示順で最初に開いているものだけを残す */
export function setOneGroup(d: AppData, on: boolean): AppData {
  const next = setSettings(d, { oneGroup: on });
  if (!on) return next;
  const vOrder = new Map(d.vehicles.map((v) => [v.id, v.order]));
  const vo = (id: ID | null) => (id ? vOrder.get(id) ?? 1e9 : 2e9);
  const sorted = [...next.groups].sort((a, b) => Number(b.pinned) - Number(a.pinned) || vo(a.vehicleId) - vo(b.vehicleId) || a.order - b.order);
  const kept = new Set<string>();
  const close = new Set<ID>();
  for (const g of sorted) {
    if (g.collapsed) continue;
    const k = g.parentId ?? '';
    if (kept.has(k)) close.add(g.id);
    else kept.add(k);
  }
  return { ...next, groups: next.groups.map((g) => (close.has(g.id) ? { ...g, collapsed: true } : g)) };
}

export const SORT_LABEL: Record<Settings['sortMode'], string> = { manual: '手動', due: '期限順', priority: '優先順' };
/** 並び順のボタン: 手動 → 期限順 → 優先順 → 手動 */
export const nextSortMode = (m: Settings['sortMode']): Settings['sortMode'] => (m === 'manual' ? 'due' : m === 'due' ? 'priority' : 'manual');

/** 並び順の切り替え（手動へ戻すときは、いまの見た目を保つ） */
export function setSortMode(d: AppData, mode: Settings['sortMode']): AppData {
  if (mode === d.settings.sortMode) return d;
  const base = mode === 'manual' ? freezeOrder(d) : d;
  return setSettings(base, { sortMode: mode });
}

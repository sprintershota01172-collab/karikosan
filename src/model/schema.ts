/**
 * 初期データ・スキーマの移行・読み込み時の検査。
 * 保存データは SCHEMA の番号つき。古い番号のデータは migrate() で今の形に直してから使う。
 */
import { isDateStr } from './dates';
import type { AppData, CalEvent, Checklist, Group, PlanEvent, Settings, Task, Vehicle } from './types';

/** 2: 大日程（plans）を追加 */
export const SCHEMA = 2;
export const APP_ID = 'karikosan';

export const VEHICLE_COLORS = ['#3D7469', '#3B6EA8', '#B7791F', '#8E5BA8', '#C2554A', '#4F8A9E', '#6B7A3A', '#9299A3'];

let seq = 0;
export const uid = (p = 'id'): string => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const defaultSettings = (): Settings => ({ fontStep: 4, showDone: true, sortMode: 'manual', vehicle: 'all', ganttZoom: 'day', oneGroup: true, planZoom: 'week' });

export function emptyData(): AppData {
  return { schema: SCHEMA, vehicles: [], groups: [], tasks: [], events: [], checklists: [], plans: [], settings: defaultSettings(), updatedAt: Date.now() };
}

export function newTask(p: Partial<Task> & { title: string }): Task {
  const now = Date.now();
  return {
    id: uid('t'),
    memo: '',
    start: null,
    due: null,
    done: false,
    doneAt: null,
    priority: 0,
    progress: 0,
    vehicleId: null,
    groupId: null,
    assignee: '',
    weekendWork: false,
    order: 0,
    createdAt: now,
    updatedAt: now,
    hiddenOn: [],
    ...p,
  };
}

export function newEvent(p: Partial<CalEvent> & { title: string; date: string }): CalEvent {
  const now = Date.now();
  return { id: uid('e'), startTime: null, endTime: null, place: '', vehicleId: null, memo: '', repeat: 'none', until: null, createdAt: now, updatedAt: now, ...p };
}

export class DataError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d);
const date = (v: unknown): string | null => (isDateStr(v) ? v : null);
const time = (v: unknown): string | null => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * 保存データ・読み込んだファイルを今のスキーマに直す。壊れた項目は捨てずに既定値で埋め、
 * id のない項目・重複した id だけを取り除く（データを失わないことを優先）。
 */
export function migrate(raw: unknown): AppData {
  let src: unknown = raw;
  if (isObj(raw) && raw.app === APP_ID && isObj(raw.data)) src = raw.data;
  if (!isObj(src)) throw new DataError('karikosan のデータではありません');
  const schema = num(src.schema, 0);
  if (schema > SCHEMA) throw new DataError('新しい版のアプリで保存されたデータです。アプリを更新してください');
  if (!Array.isArray(src.tasks) && !Array.isArray(src.vehicles)) throw new DataError('karikosan のデータではありません');

  const seen = new Set<string>();
  const okId = (v: unknown): v is string => {
    if (typeof v !== 'string' || !v || seen.has(v)) return false;
    seen.add(v);
    return true;
  };

  const vehicles: Vehicle[] = arr(src.vehicles)
    .filter(isObj)
    .filter((v) => okId(v.id))
    .map((v, i) => ({ id: v.id as string, name: str(v.name, '車種'), color: str(v.color, VEHICLE_COLORS[i % VEHICLE_COLORS.length]), order: num(v.order, i) }));
  const vIds = new Set(vehicles.map((v) => v.id));
  const vref = (v: unknown) => (typeof v === 'string' && vIds.has(v) ? v : null);

  const groups0 = arr(src.groups).filter(isObj).filter((g) => okId(g.id));
  const gIds = new Set(groups0.map((g) => g.id as string));
  const groups: Group[] = groups0.map((g, i) => ({
    id: g.id as string,
    vehicleId: vref(g.vehicleId),
    parentId: typeof g.parentId === 'string' && gIds.has(g.parentId) && g.parentId !== g.id ? g.parentId : null,
    name: str(g.name, 'グループ'),
    order: num(g.order, i),
    pinned: bool(g.pinned),
    collapsed: bool(g.collapsed),
  }));
  // 子ツリーは1段まで（孫は親の親につなぎ直す）
  const byId = new Map(groups.map((g) => [g.id, g]));
  for (const g of groups) {
    const p = g.parentId ? byId.get(g.parentId) : null;
    if (p?.parentId) g.parentId = p.parentId;
    if (p) g.vehicleId = p.vehicleId;
  }
  const gref = (v: unknown) => (typeof v === 'string' && byId.has(v) ? v : null);

  const tasks: Task[] = arr(src.tasks)
    .filter(isObj)
    .filter((t) => okId(t.id))
    .map((t, i) => {
      const pr = num(t.priority, 0);
      return {
        id: t.id as string,
        title: str(t.title),
        memo: str(t.memo),
        start: date(t.start),
        due: date(t.due),
        done: bool(t.done),
        doneAt: typeof t.doneAt === 'number' ? t.doneAt : null,
        priority: (pr >= 0 && pr <= 4 ? Math.round(pr) : 0) as Task['priority'],
        progress: Math.max(0, Math.min(100, Math.round(num(t.progress, 0)))),
        vehicleId: vref(t.vehicleId),
        groupId: gref(t.groupId),
        assignee: str(t.assignee),
        weekendWork: bool(t.weekendWork),
        order: num(t.order, i),
        createdAt: num(t.createdAt, Date.now()),
        updatedAt: num(t.updatedAt, Date.now()),
        hiddenOn: arr(t.hiddenOn).filter(isDateStr),
      };
    });
  // グループに入っているタスクの車種はグループに合わせる
  for (const t of tasks) if (t.groupId) t.vehicleId = byId.get(t.groupId)!.vehicleId;

  const reps = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];
  const events: CalEvent[] = arr(src.events)
    .filter(isObj)
    .filter((e) => isDateStr(e.date) && okId(e.id))
    .map((e) => ({
      id: e.id as string,
      title: str(e.title),
      date: e.date as string,
      startTime: time(e.startTime),
      endTime: time(e.endTime),
      place: str(e.place),
      vehicleId: vref(e.vehicleId),
      memo: str(e.memo),
      repeat: (reps.includes(e.repeat as string) ? e.repeat : 'none') as CalEvent['repeat'],
      until: date(e.until),
      createdAt: num(e.createdAt, Date.now()),
      updatedAt: num(e.updatedAt, Date.now()),
    }));

  const checklists: Checklist[] = arr(src.checklists)
    .filter(isObj)
    .filter((c) => okId(c.id))
    .map((c, i) => ({
      id: c.id as string,
      name: str(c.name, 'リスト'),
      order: num(c.order, i),
      collapsed: bool(c.collapsed),
      items: arr(c.items)
        .filter(isObj)
        .filter((x) => okId(x.id))
        .map((x, j) => ({ id: x.id as string, text: str(x.text), done: bool(x.done), order: num(x.order, j) })),
    }));

  const kinds = ['design', 'proto', 'eval', 'prep', 'mass', 'other'];
  const plans: PlanEvent[] = arr(src.plans)
    .filter(isObj)
    .filter((p) => isDateStr(p.start) && isDateStr(p.end) && okId(p.id))
    .map((p) => {
      const ld = Math.round(num(p.load, 2));
      const a = p.start as string;
      const b = p.end as string;
      return {
        id: p.id as string,
        vehicleId: vref(p.vehicleId),
        title: str(p.title),
        start: a <= b ? a : b,
        end: a <= b ? b : a,
        kind: (kinds.includes(p.kind as string) ? p.kind : 'other') as PlanEvent['kind'],
        load: (ld >= 1 && ld <= 3 ? ld : 2) as PlanEvent['load'],
        memo: str(p.memo),
        createdAt: num(p.createdAt, Date.now()),
        updatedAt: num(p.updatedAt, Date.now()),
      };
    });

  const s = isObj(src.settings) ? src.settings : {};
  const d = defaultSettings();
  const settings: Settings = {
    fontStep: Math.max(1, Math.min(10, Math.round(num(s.fontStep, d.fontStep)))),
    showDone: bool(s.showDone, d.showDone),
    sortMode: s.sortMode === 'due' || s.sortMode === 'priority' ? s.sortMode : 'manual',
    vehicle: typeof s.vehicle === 'string' && (s.vehicle === 'all' || vIds.has(s.vehicle)) ? s.vehicle : 'all',
    ganttZoom: s.ganttZoom === 'week' || s.ganttZoom === 'month' ? s.ganttZoom : 'day',
    oneGroup: bool(s.oneGroup, d.oneGroup),
    planZoom: s.planZoom === 'month' ? 'month' : 'week',
  };

  return { schema: SCHEMA, vehicles, groups, tasks, events, checklists, plans, settings, updatedAt: num(src.updatedAt, Date.now()) };
}

export interface ExportFile {
  app: typeof APP_ID;
  schema: number;
  exportedAt: string;
  data: AppData;
}

export const toExport = (data: AppData): ExportFile => ({ app: APP_ID, schema: SCHEMA, exportedAt: new Date().toISOString(), data });

/**
 * アプリの状態。軽量なストア（購読 + セレクタ）で、変わった部分だけを描き直す。
 *  - data … 保存するデータ（変更は commit() だけ。自動保存・元に戻すもここで扱う）
 *  - ui   … 画面の状態（タブ・シート・通知・選択）。保存しない
 */
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { migrate, emptyData } from '../model/schema';
import type { AppData, ID } from '../model/types';
import { initStorage, loadData, saveData, writeSnapshot, type StorageKind } from './db';

type Listener = () => void;

export interface Atom<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(fn: Listener): () => void;
}

export function atom<T>(initial: T): Atom<T> {
  let v = initial;
  const ls = new Set<Listener>();
  return {
    get: () => v,
    set(next) {
      const n = typeof next === 'function' ? (next as (p: T) => T)(v) : next;
      if (Object.is(n, v)) return;
      v = n;
      ls.forEach((f) => f());
    },
    subscribe(fn) {
      ls.add(fn);
      return () => ls.delete(fn);
    },
  };
}

/** セレクタで一部だけを購読する（結果が同じなら描き直さない） */
export function useAtom<T, S>(a: Atom<T>, sel: (v: T) => S, eq: (x: S, y: S) => boolean = Object.is): S {
  const last = useRef<{ src: T; sel: (v: T) => S; out: S } | null>(null);
  // sel は描画ごとに変わってもよい（同じ描画の中では同じ結果を返す）
  const get = useCallback(() => {
    const src = a.get();
    const prev = last.current;
    if (prev && prev.src === src && prev.sel === sel) return prev.out;
    const out = sel(src);
    if (prev && eq(prev.out, out)) {
      last.current = { src, sel, out: prev.out };
      return prev.out;
    }
    last.current = { src, sel, out };
    return out;
  }, [a, sel, eq]);
  return useSyncExternalStore(a.subscribe, get, get);
}

export const shallowArr = <T>(a: T[], b: T[]) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

/* ---------- データ ---------- */

export const dataAtom = atom<AppData>(emptyData());
export const metaAtom = atom<{ loaded: boolean; save: 'saved' | 'saving' | 'error'; storage: StorageKind; canUndo: boolean }>({ loaded: false, save: 'saved', storage: 'memory', canUndo: false });

const undoStack: AppData[] = [];
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending = false;

async function flush() {
  if (!pending) return;
  pending = false;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  try {
    await saveData(dataAtom.get());
    metaAtom.set((m) => ({ ...m, save: pending ? 'saving' : 'saved' }));
  } catch {
    metaAtom.set((m) => ({ ...m, save: 'error' }));
  }
}

function scheduleSave() {
  pending = true;
  metaAtom.set((m) => (m.save === 'saving' ? m : { ...m, save: 'saving' }));
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flush(), 120);
}

/** データを変える唯一の入口。undoable = 「元に戻す」で戻せる操作 */
export function commit(fn: (d: AppData) => AppData, opts: { undoable?: boolean; toast?: string } = {}): AppData {
  const prev = dataAtom.get();
  const next = fn(prev);
  if (next === prev) return prev;
  if (opts.undoable !== false) {
    undoStack.push(prev);
    if (undoStack.length > 50) undoStack.shift();
  }
  dataAtom.set(next);
  metaAtom.set((m) => ({ ...m, canUndo: undoStack.length > 0 }));
  scheduleSave();
  if (opts.toast) toast(opts.toast, opts.undoable !== false ? { label: '元に戻す', run: undo } : undefined);
  return next;
}

export function undo() {
  const prev = undoStack.pop();
  if (!prev) return;
  dataAtom.set({ ...prev, updatedAt: Date.now() });
  metaAtom.set((m) => ({ ...m, canUndo: undoStack.length > 0 }));
  scheduleSave();
  toast('元に戻しました');
}

/** 読み込んだデータで置き換える（読み込み・バックアップからの復元） */
export function replaceData(raw: unknown, label: string) {
  const d = migrate(raw);
  commit(() => ({ ...d, updatedAt: Date.now() }), { toast: label });
}

export async function boot() {
  const storage = await initStorage();
  const d = await loadData();
  if (d) dataAtom.set(d);
  metaAtom.set((m) => ({ ...m, loaded: true, storage }));
  // 閉じる直前・画面を離れるときに必ず書き込む（同期的な控えも残す）
  const bye = () => {
    if (pending) writeSnapshot(dataAtom.get());
    void flush();
  };
  window.addEventListener('pagehide', bye);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && bye());
}

/** テスト・開発用: 保存が終わるのを待つ */
export const flushNow = flush;

/* ---------- 画面の状態 ---------- */

export type Tab = 'home' | 'tasks' | 'gantt' | 'plan' | 'calendar' | 'settings';
export const TABS: Tab[] = ['home', 'tasks', 'gantt', 'plan', 'calendar', 'settings'];

export interface SheetSpec {
  kind: string;
  props?: Record<string, unknown>;
  id?: number;
  closing?: boolean;
}

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

export interface UI {
  tab: Tab;
  sheets: SheetSpec[];
  toast: Toast | null;
  selected: ID | null;
  /** 一覧の絞り込み（タスク画面・ガントで共通） */
  status: import('../model/rows').StatusFilter;
  assignee: string | null;
  query: string;
  tasksView: 'tasks' | 'checklists';
  /** 画面の上に出す追加の入力欄（components/Compose.tsx） */
  compose: { placeholder: string; hint: string; n: number; last: string } | null;
}

const tabFromHash = (): Tab => {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace('#', '') as Tab;
  return TABS.includes(h) ? h : 'home';
};

export const uiAtom = atom<UI>({ tab: tabFromHash(), sheets: [], toast: null, selected: null, status: 'all', assignee: null, query: '', tasksView: 'tasks', compose: null });

export const setUI = (p: Partial<UI>) => uiAtom.set((u) => ({ ...u, ...p }));

/**
 * 選択の解除（伸ばすモードを抜ける）。選んでいるもの以外をタップしたときに App から呼ぶ。
 * 解除した直後のタップで「追加」などが動かないよう、解除した時刻を覚えておく。
 */
let clearedAt = 0;
export function clearSelection() {
  if (!uiAtom.get().selected) return;
  clearedAt = Date.now();
  setUI({ selected: null });
}
export const justCleared = () => Date.now() - clearedAt < 500;

export function setTab(t: Tab) {
  setUI({ tab: t, selected: null });
  try {
    history.replaceState(null, '', `#${t}`);
  } catch {
    /* 埋め込み表示などでは無視 */
  }
}

let sheetSeq = 1;
export function openSheet(kind: string, props: Record<string, unknown> = {}) {
  uiAtom.set((u) => ({ ...u, sheets: [...u.sheets, { kind, props, id: sheetSeq++ }] }));
}

/** いちばん上のシートを閉じる（下に滑らせてから外す） */
export function closeSheet() {
  uiAtom.set((u) => {
    const i = u.sheets.map((s) => !s.closing).lastIndexOf(true);
    if (i < 0) return u;
    const id = u.sheets[i].id;
    setTimeout(() => uiAtom.set((x) => ({ ...x, sheets: x.sheets.filter((s) => s.id !== id) })), 220);
    return { ...u, sheets: u.sheets.map((s, j) => (j === i ? { ...s, closing: true } : s)) };
  });
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function toast(text: string, action?: Toast['action']) {
  const id = Date.now();
  setUI({ toast: { id, text, action } });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => uiAtom.set((u) => (u.toast?.id === id ? { ...u, toast: null } : u)), action ? 5000 : 2400);
}

export const useData = <S>(sel: (d: AppData) => S, eq?: (a: S, b: S) => boolean) => useAtom(dataAtom, sel, eq);
export const useUI = <S>(sel: (u: UI) => S, eq?: (a: S, b: S) => boolean) => useAtom(uiAtom, sel, eq);
export const useMeta = <S>(sel: (m: ReturnType<typeof metaAtom.get>) => S) => useAtom(metaAtom, sel);

export const getUI = () => uiAtom.get();

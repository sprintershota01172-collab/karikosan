/**
 * 端末への保存。IndexedDB（使えない環境では localStorage、それも無理ならメモリだけ）。
 *  - data: いまのデータ（1つのトランザクションで丸ごと書くので、途中で壊れない）
 *  - backups: 1日1回の自動バックアップ（直近7件）
 */
import { migrate } from '../model/schema';
import type { AppData } from '../model/types';

const DB = 'karikosan';
const STORE = 'kv';
const LS_KEY = 'karikosan:data';
const LS_BACKUP = 'karikosan:backups';

export type StorageKind = 'indexeddb' | 'localstorage' | 'memory';
export interface Backup {
  at: number;
  data: AppData;
}

let kind: StorageKind = 'memory';
let dbp: Promise<IDBDatabase> | null = null;
const mem = new Map<string, unknown>();

function openDb(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
  return dbp;
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function initStorage(): Promise<StorageKind> {
  try {
    if (typeof indexedDB !== 'undefined') {
      await openDb();
      await idbGet('probe');
      kind = 'indexeddb';
      // ブラウザが容量不足のときに消さないよう求める（対応ブラウザのみ）
      void navigator.storage?.persist?.().catch(() => undefined);
      return kind;
    }
  } catch {
    /* 次の方法へ */
  }
  try {
    localStorage.setItem('karikosan:probe', '1');
    localStorage.removeItem('karikosan:probe');
    kind = 'localstorage';
  } catch {
    kind = 'memory';
  }
  return kind;
}

async function get<T>(key: string): Promise<T | undefined> {
  if (kind === 'indexeddb') return idbGet<T>(key);
  if (kind === 'localstorage') {
    const raw = localStorage.getItem(key === 'data' ? LS_KEY : LS_BACKUP);
    return raw ? (JSON.parse(raw) as T) : undefined;
  }
  return mem.get(key) as T | undefined;
}

async function set(key: string, value: unknown): Promise<void> {
  if (kind === 'indexeddb') return idbSet(key, value);
  if (kind === 'localstorage') {
    localStorage.setItem(key === 'data' ? LS_KEY : LS_BACKUP, JSON.stringify(value));
    return;
  }
  mem.set(key, value);
}

/**
 * 画面を閉じる直前に、同期的に書ける localStorage へも控えを書く（IndexedDB の書き込みは
 * 閉じる瞬間に間に合わないことがあるため）。読み込むときは新しいほうを使う。
 */
const SNAP = 'karikosan:snapshot';
export function writeSnapshot(d: AppData) {
  if (kind !== 'indexeddb') return;
  try {
    localStorage.setItem(SNAP, JSON.stringify(d));
  } catch {
    /* 容量不足などは無視（IndexedDB が本体） */
  }
}
function readSnapshot(): AppData | null {
  try {
    const raw = localStorage.getItem(SNAP);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function loadData(): Promise<AppData | null> {
  const snap = kind === 'indexeddb' ? readSnapshot() : null;
  try {
    const raw = await get<unknown>('data');
    if (raw == null) return snap;
    const d = migrate(raw);
    return snap && snap.updatedAt > d.updatedAt ? snap : d;
  } catch {
    if (snap) return snap;
    // 壊れていたら、いちばん新しいバックアップから戻す
    const b = await listBackups();
    for (const x of b) {
      try {
        return migrate(x.data);
      } catch {
        /* 次のバックアップ */
      }
    }
    return null;
  }
}

const dayOf = (t: number) => new Date(t).toDateString();

export async function saveData(d: AppData): Promise<void> {
  await set('data', d);
  try {
    const list = (await get<Backup[]>('backups')) ?? [];
    if (!list.length || dayOf(list[0].at) !== dayOf(Date.now())) {
      await set('backups', [{ at: Date.now(), data: d }, ...list].slice(0, 7));
    }
  } catch {
    /* バックアップに失敗しても本体の保存は済んでいる */
  }
}

export async function listBackups(): Promise<Backup[]> {
  try {
    return (await get<Backup[]>('backups')) ?? [];
  } catch {
    return [];
  }
}

export const storageKind = () => kind;

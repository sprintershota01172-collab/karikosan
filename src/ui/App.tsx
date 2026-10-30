import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { closeSheet, setTab, TABS, undo, uiAtom, useData, useMeta, useUI, type Tab } from '../store/store';
import { Icon } from './icons';
import { applyUpdate, BUILD, latestBuild } from './platform';
import { Calendar } from './screens/Calendar';
import { GanttScreen } from './screens/GanttScreen';
import { PlanScreen } from './screens/Plan';
import { greeting, Home } from './screens/Home';
import { shortDate, today } from '../model/dates';
import { FONT_PX, Settings } from './screens/Settings';
import { Tasks } from './screens/Tasks';
import { SHEETS } from './sheets';

const META: Record<Tab, { label: string; icon: string; title: string }> = {
  home: { label: 'ホーム', icon: 'home', title: 'ホーム' },
  tasks: { label: 'タスク', icon: 'tasks', title: 'タスク' },
  gantt: { label: 'ガント', icon: 'gantt', title: 'ガント' },
  plan: { label: '大日程', icon: 'flag', title: '大日程' },
  calendar: { label: '予定', icon: 'calendar', title: '予定' },
  settings: { label: '設定', icon: 'settings', title: '設定' },
};

const SCREEN: Record<Tab, () => ReactElement> = { home: Home, tasks: Tasks, gantt: GanttScreen, plan: PlanScreen, calendar: Calendar, settings: Settings };

/**
 * 画面の切り替え: 新しい画面を少し横から、前の画面を反対側へ、同時に控えめなフェードで入れ替える。
 * 連続でタップしたときは、途中の画面を捨てて最後の画面だけを残す（二重のアニメーションにしない）。
 */
function Panes() {
  const tab = useUI((u) => u.tab);
  const [st, setSt] = useState<{ cur: Tab; prev: Tab | null; back: boolean; seq: number }>({ cur: tab, prev: null, back: false, seq: 0 });
  useLayoutEffect(() => {
    if (tab === st.cur) return;
    setSt((s) => ({ cur: tab, prev: s.cur, back: TABS.indexOf(tab) < TABS.indexOf(s.cur), seq: s.seq + 1 }));
  }, [tab]);
  useEffect(() => {
    if (!st.prev) return;
    const t = setTimeout(() => setSt((s) => (s.seq === st.seq ? { ...s, prev: null } : s)), 260);
    return () => clearTimeout(t);
  }, [st.seq]);
  const Cur = SCREEN[st.cur];
  const Prev = st.prev ? SCREEN[st.prev] : null;
  return (
    <main className="main">
      {Prev && (
        <div key={`p-${st.prev}-${st.seq}`} className={`pane out${st.back ? ' back' : ''}`} aria-hidden="true">
          <Prev />
        </div>
      )}
      <div key={`c-${st.cur}`} className={`pane${st.seq ? ' in' : ''}${st.back ? ' back' : ''}`}>
        <Cur />
      </div>
    </main>
  );
}

function Sheets() {
  const sheets = useUI((u) => u.sheets);
  return (
    <>
      {sheets.map((s) => {
        const C = SHEETS[s.kind];
        return C ? <C key={s.id} props={s.props ?? {}} closing={s.closing} /> : null;
      })}
    </>
  );
}

function ToastView() {
  const t = useUI((u) => u.toast);
  if (!t) return null;
  return (
    <div className="toast" role="status" key={t.id}>
      <span>{t.text}</span>
      {t.action && (
        <button type="button" onClick={() => (t.action!.run(), uiAtom.set((u) => ({ ...u, toast: null })))}>
          {t.action.label}
        </button>
      )}
    </div>
  );
}

/** 新しい版があれば知らせる（起動時と、アプリに戻ったとき。10分に1回まで） */
function UpdateBar() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof __PWA__ === 'undefined' || !__PWA__ || BUILD === 'dev') return;
    let last = 0;
    const check = async () => {
      if (document.hidden || !navigator.onLine || Date.now() - last < 10 * 60_000) return;
      last = Date.now();
      const b = await latestBuild();
      if (b && b !== BUILD) setReady(true);
    };
    void check();
    const on = () => void check();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  if (!ready) return null;
  return (
    <div className="update-bar" role="status">
      <span>新しい版があります</span>
      <button type="button" className="btn small primary" onClick={() => void applyUpdate()}>
        更新する
      </button>
    </div>
  );
}

const isTextField = (el: Element | null) => !!el && (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'button', 'submit', 'color', 'file'].includes(el.type)) || (el as HTMLElement).isContentEditable);

/**
 * 文字を打つとき（キーボードが出たとき）に画面全体が上にずれないようにする。
 *  - iPhone はキーボードを出すとき、入力欄が見えるようにページ全体を上へずらす（ヘッダーが画面の外に出る）
 *  - アプリの高さを「キーボードの上に見えている範囲」に合わせ、ずれたページを元の位置に戻す
 *    → ヘッダーはそのまま、入力欄はキーボードのすぐ上に来る。下のタブはキーボードの間だけ隠す
 */
function useKeyboardFit() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    if (!vv) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const kb = Math.max(0, window.innerHeight - vv.height);
      const open = kb > 120 && isTextField(document.activeElement);
      root.classList.toggle('kb-open', open);
      if (open) root.style.setProperty('--app-h', `${Math.round(vv.height)}px`);
      else root.style.removeProperty('--app-h');
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
      if (document.scrollingElement && document.scrollingElement.scrollTop) document.scrollingElement.scrollTop = 0;
    };
    const later = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const settle = () => {
      later();
      setTimeout(apply, 120);
      setTimeout(apply, 360);
    };
    vv.addEventListener('resize', later);
    vv.addEventListener('scroll', later);
    window.addEventListener('scroll', later, { passive: true });
    document.addEventListener('focusin', settle);
    document.addEventListener('focusout', settle);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', later);
      vv.removeEventListener('scroll', later);
      window.removeEventListener('scroll', later);
      document.removeEventListener('focusin', settle);
      document.removeEventListener('focusout', settle);
      root.classList.remove('kb-open');
      root.style.removeProperty('--app-h');
    };
  }, []);
}

export function App() {
  useKeyboardFit();
  const tab = useUI((u) => u.tab);
  const fontStep = useData((d) => d.settings.fontStep);
  const save = useMeta((m) => m.save);
  const canUndo = useMeta((m) => m.canUndo);
  const loaded = useMeta((m) => m.loaded);
  // 文字サイズは html の基準の大きさ1か所で変える（すべて rem なので全画面に同時に反映）
  useLayoutEffect(() => {
    document.documentElement.style.fontSize = `${FONT_PX[fontStep - 1] ?? 15}px`;
  }, [fontStep]);
  // 戻るボタン（Android・PC）でシートを閉じる
  const sheetsOpen = useUI((u) => u.sheets.length);
  const lastSheets = useRef(0);
  useEffect(() => {
    lastSheets.current = sheetsOpen;
  }, [sheetsOpen]);
  useEffect(() => {
    const onHash = () => {
      const h = location.hash.replace('#', '') as Tab;
      if (TABS.includes(h) && h !== uiAtom.get().tab) setTab(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const m = META[tab];
  return (
    <div className="app">
      <header className="top">
        <h1 className="grow">
          <span className="ellipsis">{tab === 'home' ? greeting() : m.title}</span>
          {tab === 'home' && <small className="num">{shortDate(today())}</small>}
        </h1>
        <span className="save-dot" data-s={save} aria-label={save === 'saved' ? '保存済み' : save === 'saving' ? '保存中' : '保存に失敗'} title={save === 'saved' ? '保存済み' : '保存中'} />
        <button type="button" className="iconbtn" aria-label="元に戻す" disabled={!canUndo} onClick={undo}>
          <Icon name="undo" />
        </button>
        <button type="button" className="iconbtn" aria-label="検索" onClick={() => uiAtom.set((u) => ({ ...u, sheets: u.sheets.some((s) => s.kind === 'search') ? u.sheets : [...u.sheets, { kind: 'search', id: Date.now() }] }))}>
          <Icon name="search" />
        </button>
      </header>
      {loaded ? <Panes /> : <main className="main" />}
      <nav className="nav" aria-label="画面">
        {TABS.map((t) => (
          <button key={t} type="button" aria-current={t === tab ? 'page' : undefined} onClick={() => (uiAtom.get().sheets.length ? closeSheet() : null, setTab(t))}>
            <Icon name={META[t].icon} size={22} />
            <span>{META[t].label}</span>
          </button>
        ))}
      </nav>
      <Sheets />
      <ToastView />
      <UpdateBar />
    </div>
  );
}

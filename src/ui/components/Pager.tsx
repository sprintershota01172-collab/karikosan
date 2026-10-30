/**
 * 縦スワイプを使わない表示領域。
 *  - 縦にはスクロールさせない（CSS で overflow-y: hidden ／ touch-action: pan-x）。指を縦に動かしても画面は動かない
 *  - 収まらない分は下の「▲ 上に◯件」「下に◯件 ▼」で1画面ずつ送る。送り先は行の境目にそろえる（行が切れたまま送らない）
 *  - 収まっているときはボタンを出さない。出したボタンを消すのは「消しても収まる」ときだけ（出し入れで高さが揺れない）
 *  - PC のホイール・トラックパッドは今までどおり動かす（なくすのはタッチの縦スワイプだけ）
 *
 * 位置の計算は offsetTop（transform の影響を受けない）で行うので、並べ替えのアニメーション中でもずれない。
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../icons';

export interface PagerOpts {
  /** 件数を数える行（例: '[data-sort-key]'）。指定しないときは「上へ」「下へ」だけ出す */
  item?: string;
  /** 送るときに先頭にそろえる行 */
  stops?: string;
  /** 上に固定している見出しの高さ（ガントの日付など） */
  top?: () => number;
}

export interface PagerApi {
  show: boolean;
  up: number;
  down: number;
  counted: boolean;
  canUp: boolean;
  canDown: boolean;
  prev: () => void;
  next: () => void;
  /** el から始まるまとまり（data-level が el 以下になるまで）が見えるように送る */
  reveal: (el: Element | null) => void;
  barRef: { current: HTMLDivElement | null };
}

const apis = new WeakMap<Element, PagerApi>();

/** 要素が入っている送り領域で、その要素が見えるように送る（なければ普通にスクロール） */
export function revealIn(el: Element | null) {
  if (!el) return;
  const view = el.closest('[data-paged]');
  const api = view ? apis.get(view) : null;
  if (api) api.reveal(el);
  else el.scrollIntoView?.({ block: 'nearest' });
}

/** 送り領域の中での位置（offsetTop をたどる。transform・スクロール量の影響を受けない） */
function posIn(view: HTMLElement, el: HTMLElement): number | null {
  let y = 0;
  let x: HTMLElement | null = el;
  while (x && x !== view) {
    y += x.offsetTop;
    const p = x.offsetParent as HTMLElement | null;
    if (!p || !view.contains(p)) return p === view ? y : null;
    x = p;
  }
  return x === view ? y : null;
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 中身の高さ（scrollHeight は並べ替えのアニメーション中の transform で一時的に伸びるので使わない） */
function contentHeight(el: HTMLElement): number {
  let h = 0;
  for (const c of Array.from(el.children)) if (c instanceof HTMLElement && c.offsetParent === el) h = Math.max(h, c.offsetTop + c.offsetHeight);
  return h + (parseFloat(getComputedStyle(el).paddingBottom) || 0);
}

export function usePager(view: { current: HTMLElement | null }, ready: unknown, opts: PagerOpts = {}): PagerApi {
  const o = useRef(opts);
  o.current = opts;
  const [st, setSt] = useState({ show: false, up: 0, down: 0, canUp: false, canDown: false });
  const shown = useRef(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  /** スクロール先（スムーズに送っている途中でもう一度押したときは、そこから次へ） */
  const goal = useRef<number | null>(null);

  const off = () => o.current.top?.() ?? 0;
  const cur = (el: HTMLElement) => goal.current ?? el.scrollTop;
  const go = (el: HTMLElement, top: number) => {
    const t = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, Math.round(top)));
    goal.current = t;
    el.scrollTo({ top: t, behavior: reduced() ? 'auto' : 'smooth' });
  };
  const rows = (el: HTMLElement, sel?: string) => {
    if (!sel) return [];
    const out: { y: number; h: number }[] = [];
    for (const x of Array.from(el.querySelectorAll<HTMLElement>(sel))) {
      if (!x.offsetHeight) continue;
      const y = posIn(el, x);
      if (y != null) out.push({ y, h: x.offsetHeight });
    }
    return out.sort((a, b) => a.y - b.y);
  };

  const next = () => {
    const el = view.current;
    if (!el) return;
    const s = cur(el);
    const page = el.clientHeight - off();
    let step = page - Math.min(32, page * 0.1); // 行の区切りがないときは少し重ねて送る
    for (const r of rows(el, o.current.stops)) {
      // 下が切れている最初の行を、次の画面の先頭にする
      if (r.y + r.h > s + el.clientHeight + 1) {
        if (r.y - off() > s + 1) step = Math.min(r.y - off() - s, page);
        break;
      }
    }
    go(el, s + step);
  };
  const prev = () => {
    const el = view.current;
    if (!el) return;
    const s = cur(el);
    const page = el.clientHeight - off();
    let target = s - (page - Math.min(32, page * 0.1));
    const list = rows(el, o.current.stops);
    if (list.length) {
      // いまの先頭の行が、前の画面のいちばん下に来るようにする
      const want = s - page;
      const r = list.find((x) => x.y - off() >= want - 1);
      if (r && r.y - off() < s - 1) target = r.y - off();
    }
    go(el, target);
  };
  const reveal = (start: Element | null) => {
    const el = view.current;
    if (!el || !(start instanceof HTMLElement)) return;
    const level = Number(start.dataset.level);
    let last: HTMLElement = start;
    if (Number.isFinite(level)) {
      for (let n = start.nextElementSibling as HTMLElement | null; n; n = n.nextElementSibling as HTMLElement | null) {
        const l = Number(n.dataset.level);
        if (Number.isFinite(l) && l <= level) break;
        if (n.offsetHeight) last = n;
      }
    }
    const a = posIn(el, start);
    const b = posIn(el, last);
    if (a == null || b == null) return;
    const s = el.scrollTop;
    if (a - off() >= s - 1 && b + last.offsetHeight <= s + el.clientHeight + 1) return;
    go(el, a - off());
  };

  const api: PagerApi = { ...st, counted: !!opts.item, prev, next, reveal, barRef };
  const apiRef = useRef(api);
  apiRef.current = api;
  if (view.current) apis.set(view.current, api);

  useLayoutEffect(() => {
    const el = view.current;
    if (!el) return;
    el.setAttribute('data-paged', '');
    let raf = 0;
    const measure = () => {
      raf = 0;
      const sh = contentHeight(el);
      const ch = el.clientHeight;
      let space = 0;
      if (shown.current && barRef.current) {
        const p = barRef.current.parentElement;
        const gap = p ? parseFloat(getComputedStyle(p).rowGap) || 0 : 0;
        space = barRef.current.offsetHeight + gap;
      }
      const show = sh > ch + space + 1;
      shown.current = show;
      const s = el.scrollTop;
      if (goal.current != null && Math.abs(s - goal.current) < 2) goal.current = null;
      let up = 0;
      let down = 0;
      if (o.current.item) {
        const top = s + off();
        const bottom = s + ch;
        for (const r of rows(el, o.current.item)) {
          if (r.y < top - 1) up++;
          else if (r.y + r.h > bottom + 1) down++;
        }
      }
      const nx = { show, up, down, canUp: s > 1, canDown: s + ch < sh - 1 };
      setSt((p) => (p.show === nx.show && p.up === nx.up && p.down === nx.down && p.canUp === nx.canUp && p.canDown === nx.canDown ? p : nx));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    const mo = new MutationObserver((recs) => {
      for (const r of recs) for (const n of Array.from(r.addedNodes)) if (n instanceof Element && n.parentElement === el) ro.observe(n);
      schedule();
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    const onScroll = () => schedule();
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('transitionend', onScroll);
    // PC のホイールは今までどおり（縦の分だけ動かす。横はガントの横スクロールのまま）
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const before = el.scrollTop;
      goal.current = null;
      el.scrollTop = before + e.deltaY * k;
      if (el.scrollTop !== before) e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    measure();
    apis.set(el, apiRef.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('transitionend', onScroll);
      el.removeEventListener('wheel', onWheel);
      apis.delete(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return api;
}

/** ▲▼ のボタン（収まらないときだけ出る） */
export function PagerBar({ p, unit = '件' }: { p: PagerApi; unit?: string }) {
  if (!p.show) return null;
  return (
    <div className="pager" ref={p.barRef}>
      <button type="button" className="pg" disabled={!p.canUp} onClick={p.prev} aria-label="前の画面へ">
        <Icon name="up" size={16} />
        <span>{p.counted ? (p.up ? `上に${p.up}${unit}` : '先頭') : '上へ'}</span>
      </button>
      <button type="button" className="pg" disabled={!p.canDown} onClick={p.next} aria-label="次の画面へ">
        <span>{p.counted ? (p.down ? `下に${p.down}${unit}` : '最後') : '下へ'}</span>
        <Icon name="down" size={16} />
      </button>
    </div>
  );
}

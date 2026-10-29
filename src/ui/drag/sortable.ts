/**
 * 長押しドラッグの並べ替え（一覧・ガント・チェックリストで共通）。
 *
 * ガタつきを出さないための決まり:
 *  1. ドラッグを始めた瞬間に、同じグループの行の位置と高さを1回だけ測る（スナップショット）。
 *     以降は DOM を並べ替えず、行を transform でずらすだけなので、測り直しのループが起きない。
 *  2. 挿入位置は「つかんだ行の中心」と「スナップショットの各行の中心」の比較で決める。
 *     ほかの行をずらしても基準は動かないので、境目で行ったり来たりしない。
 *  3. つかんだ行そのものを指に追従させる（複製を作らない）。ガントの行も名前とバーが一緒に動く。
 *  4. 指を離したら確定位置まで滑らせ、flushSync でデータの並びを変えた直後に transform を外す
 *     （同じフレームで入れ替わるので、ちらつかない）。
 *  5. タッチは長押し（280ms）で開始。待っている間に 8px 以上動いた・スクロールした場合はスクロールとして扱う。
 *     マウスは 5px 動かすか長押しで開始。
 */
import { flushSync } from 'react-dom';

export interface SortableOptions {
  /** 縦にスクロールする要素（自動スクロールと座標の計算に使う） */
  scroller: HTMLElement;
  /** 並べ替えが確定したとき（group 内の新しい順番） */
  onDrop: (key: string, group: string, keys: string[]) => void;
  /** ドラッグの開始・終了（選択の解除などに使う） */
  onState?: (dragging: string | null) => void;
  longPressMs?: number;
}

interface Snap {
  key: string;
  group: string;
  els: HTMLElement[];
  keys: string[];
  tops: number[];
  heights: number[];
  i0: number;
  shift: number;
  grab: number;
  target: number;
  lastClientY: number;
}

const ITEM = '[data-sort-key]';
const NO_DRAG = 'input, textarea, select, [data-no-drag]';

export let dragActive = false;

export function attachSortable(root: HTMLElement, opts: SortableOptions): () => void {
  const press = opts.longPressMs ?? 280;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { el: HTMLElement; x: number; y: number; touch: boolean; id: number } | null = null;
  let snap: Snap | null = null;
  let raf = 0;
  let suppressClick = false;

  const contentY = (clientY: number) => clientY - opts.scroller.getBoundingClientRect().top + opts.scroller.scrollTop;

  const clearPending = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  function begin(el: HTMLElement, clientY: number) {
    const key = el.dataset.sortKey!;
    const group = el.dataset.sortGroup ?? '';
    const els = Array.from(root.querySelectorAll<HTMLElement>(ITEM)).filter((x) => (x.dataset.sortGroup ?? '') === group);
    const i0 = els.indexOf(el);
    if (i0 < 0) return;
    const st = opts.scroller.getBoundingClientRect().top - opts.scroller.scrollTop;
    const tops = els.map((x) => x.getBoundingClientRect().top - st);
    const heights = els.map((x) => x.getBoundingClientRect().height);
    const shift = i0 + 1 < els.length ? tops[i0 + 1] - tops[i0] : i0 > 0 ? tops[i0] - tops[i0 - 1] : heights[i0];
    snap = { key, group, els, keys: els.map((x) => x.dataset.sortKey!), tops, heights, i0, shift, grab: contentY(clientY) - tops[i0], target: i0, lastClientY: clientY };
    dragActive = true;
    root.classList.add('dragging-on');
    el.classList.add('lifted');
    el.style.zIndex = '10';
    el.style.transition = 'none';
    el.style.boxShadow = '0 10px 26px rgba(25,40,59,0.18), 0 2px 6px rgba(25,40,59,0.08)';
    el.style.position = 'relative';
    opts.onState?.(key);
    loop();
  }

  function place(clientY: number) {
    const s = snap!;
    s.lastClientY = clientY;
    const y = contentY(clientY) - s.grab; // つかんだ行の上端（内容の座標）
    const dy = y - s.tops[s.i0];
    s.els[s.i0].style.transform = `translate3d(0, ${dy}px, 0)`;
    const center = y + s.heights[s.i0] / 2;
    let j = 0;
    for (let k = 0; k < s.els.length; k++) {
      if (k === s.i0) continue;
      if (s.tops[k] + s.heights[k] / 2 < center) j++;
    }
    if (j === s.target) return;
    s.target = j;
    for (let k = 0; k < s.els.length; k++) {
      if (k === s.i0) continue;
      let t = 0;
      if (s.i0 < j && k > s.i0 && k <= j) t = -s.shift;
      else if (j < s.i0 && k >= j && k < s.i0) t = s.shift;
      const v = t ? `translate3d(0, ${t}px, 0)` : '';
      if (s.els[k].style.transform !== v) s.els[k].style.transform = v;
    }
  }

  /** 端に近づいたら自動でスクロール */
  function loop() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (!snap) return;
      const r = opts.scroller.getBoundingClientRect();
      const edge = Math.min(56, r.height / 5);
      const y = snap.lastClientY;
      let v = 0;
      if (y < r.top + edge) v = -Math.ceil(((r.top + edge - y) / edge) * 14);
      else if (y > r.bottom - edge) v = Math.ceil(((y - (r.bottom - edge)) / edge) * 14);
      if (v) {
        const before = opts.scroller.scrollTop;
        opts.scroller.scrollTop = before + v;
        if (opts.scroller.scrollTop !== before) place(y);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function finish(commit: boolean) {
    const s = snap;
    if (!s) return;
    cancelAnimationFrame(raf);
    snap = null;
    // マウスで離した直後のクリック（行を開く）を1回だけ無視する
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 400);
    const el = s.els[s.i0];
    const j = commit ? s.target : s.i0;
    let dest = s.tops[s.i0];
    if (j > s.i0) dest = s.tops[j] + s.heights[j] - s.heights[s.i0];
    else if (j < s.i0) dest = s.tops[j];
    const settle = () => {
      el.removeEventListener('transitionend', settle);
      clearTimeout(fallback);
      const keys = [...s.keys];
      keys.splice(s.i0, 1);
      keys.splice(j, 0, s.key);
      root.classList.add('drag-settle');
      if (j !== s.i0) flushSync(() => opts.onDrop(s.key, s.group, keys));
      for (const x of s.els) {
        x.style.transform = '';
      }
      el.style.zIndex = '';
      el.style.boxShadow = '';
      el.style.position = '';
      el.style.transition = '';
      el.classList.remove('lifted');
      root.classList.remove('dragging-on');
      dragActive = false;
      opts.onState?.(null);
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('drag-settle')));
    };
    el.style.transition = `transform var(--t-move) var(--ease), box-shadow var(--t-move) ease`;
    el.style.boxShadow = '';
    const to = `translate3d(0, ${dest - s.tops[s.i0]}px, 0)`;
    const fallback = setTimeout(settle, 320);
    if (el.style.transform === to || !el.style.transform) {
      settle();
      return;
    }
    el.addEventListener('transitionend', settle);
    el.style.transform = to;
  }

  /* ---------- タッチ ---------- */
  const onTouchStart = (e: TouchEvent) => {
    if (snap || e.touches.length > 1) {
      if (!snap) clearPending();
      return;
    }
    const t = e.touches[0];
    const target = e.target as Element;
    const el = target.closest<HTMLElement>(ITEM);
    if (!el || !root.contains(el) || target.closest(NO_DRAG) || el.dataset.sortOff === 'true') return;
    pending = { el, x: t.clientX, y: t.clientY, touch: true, id: t.identifier };
    timer = setTimeout(() => {
      if (!pending) return;
      const p = pending;
      timer = null;
      pending = null;
      begin(p.el, p.y);
    }, press);
  };
  const onTouchMove = (e: TouchEvent) => {
    if (snap) {
      e.preventDefault();
      const t = Array.from(e.touches)[0];
      if (t) place(t.clientY);
      return;
    }
    if (pending) {
      const t = e.touches[0];
      if (Math.hypot(t.clientX - pending.x, t.clientY - pending.y) > 8) clearPending();
    }
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (snap) {
      e.preventDefault();
      finish(true);
    }
    clearPending();
  };
  const onTouchCancel = () => {
    if (snap) finish(false);
    clearPending();
  };

  /* ---------- マウス・ペン ---------- */
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || e.button !== 0 || snap) return;
    const target = e.target as Element;
    const el = target.closest<HTMLElement>(ITEM);
    if (!el || !root.contains(el) || target.closest(NO_DRAG) || el.dataset.sortOff === 'true') return;
    pending = { el, x: e.clientX, y: e.clientY, touch: false, id: e.pointerId };
    timer = setTimeout(() => {
      if (!pending) return;
      const p = pending;
      timer = null;
      pending = null;
      begin(p.el, p.y);
    }, press);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (snap) {
      e.preventDefault();
      place(e.clientY);
      return;
    }
    if (pending && !pending.touch && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 5) {
      const p = pending;
      clearPending();
      begin(p.el, p.y);
      if (snap) place(e.clientY);
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (snap) finish(true);
    clearPending();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && snap) finish(false);
  };
  const onScroll = () => {
    // 長押しを待っている間にスクロールしたら、ドラッグにしない
    if (pending && pending.touch) clearPending();
  };
  const onClickCapture = (e: MouseEvent) => {
    if (suppressClick) {
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };
  const onContext = (e: Event) => {
    if (snap || pending) e.preventDefault();
  };

  root.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: false });
  window.addEventListener('touchcancel', onTouchCancel);
  root.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKey);
  opts.scroller.addEventListener('scroll', onScroll, { passive: true });
  root.addEventListener('click', onClickCapture, true);
  root.addEventListener('contextmenu', onContext);
  return () => {
    if (snap) finish(false);
    clearPending();
    cancelAnimationFrame(raf);
    root.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchCancel);
    root.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKey);
    opts.scroller.removeEventListener('scroll', onScroll);
    root.removeEventListener('click', onClickCapture, true);
    root.removeEventListener('contextmenu', onContext);
  };
}

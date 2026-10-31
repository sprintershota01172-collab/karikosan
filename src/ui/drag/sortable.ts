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
 *  6. 長押ししたまま動かさずに離したら onHold（メニューを出すなど）。動かしたら並べ替え。
 *  7. data-sort-span="N" の項目は、後ろの N 行を一緒に動かす（ガントの車種・グループ = 中のタスクの行ごと動く）。
 *  8. axis: 'x' で横の並べ替え（上の車種のボタン）。
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
  /** 長押ししたまま動かさずに離したとき */
  onHold?: (key: string, el: HTMLElement) => void;
  /** 並べる向き（初期は縦） */
  axis?: 'x' | 'y';
}

interface Snap {
  key: string;
  group: string;
  els: HTMLElement[];
  /** 一緒に動く要素（els[k] と、その後ろの span 行） */
  members: HTMLElement[][];
  moved: boolean;
  keys: string[];
  tops: number[];
  heights: number[];
  i0: number;
  shift: number;
  grab: number;
  target: number;
  lastClientY: number;
  startClientY: number;
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
  /** 押した位置（長押しのメニューは、ここからほとんど動かさずに離したときだけ） */
  let origin = { x: 0, y: 0 };
  const drift = (x: number, y: number) => {
    if (snap && !snap.moved && Math.hypot(x - origin.x, y - origin.y) > 6) snap.moved = true;
  };

  const X = opts.axis === 'x';
  const pos = (e: { clientX: number; clientY: number }) => (X ? e.clientX : e.clientY);
  const start = (r: DOMRect) => (X ? r.left : r.top);
  const size = (r: DOMRect) => (X ? r.width : r.height);
  const scrollOf = () => (X ? opts.scroller.scrollLeft : opts.scroller.scrollTop);
  const tr = (v: number) => (X ? `translate3d(${v}px, 0, 0)` : `translate3d(0, ${v}px, 0)`);
  const contentY = (clientY: number) => clientY - start(opts.scroller.getBoundingClientRect()) + scrollOf();
  const membersOf = (el: HTMLElement): HTMLElement[] => {
    const n = Number(el.dataset.sortSpan ?? 0);
    const out = [el];
    let x = el.nextElementSibling as HTMLElement | null;
    for (let i = 0; i < n && x; i++, x = x.nextElementSibling as HTMLElement | null) out.push(x);
    return out;
  };
  const setT = (ms: HTMLElement[], v: string) => {
    for (const m of ms) if (m.style.transform !== v) m.style.transform = v;
  };

  const clearPending = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  function begin(el: HTMLElement, clientY: number, moved = false) {
    const key = el.dataset.sortKey!;
    const group = el.dataset.sortGroup ?? '';
    const els = Array.from(root.querySelectorAll<HTMLElement>(ITEM)).filter((x) => (x.dataset.sortGroup ?? '') === group);
    const i0 = els.indexOf(el);
    if (i0 < 0) return;
    const st = start(opts.scroller.getBoundingClientRect()) - scrollOf();
    const members = els.map(membersOf);
    const tops = els.map((x) => start(x.getBoundingClientRect()) - st);
    const heights = members.map((ms) => {
      const a = ms[0].getBoundingClientRect();
      const b = ms[ms.length - 1].getBoundingClientRect();
      return X ? b.right - a.left : b.bottom - a.top;
    });
    const block = members[i0].length > 1;
    const shift = block ? heights[i0] : i0 + 1 < els.length ? tops[i0 + 1] - tops[i0] : i0 > 0 ? tops[i0] - tops[i0 - 1] : heights[i0];
    snap = { key, group, els, members, moved, keys: els.map((x) => x.dataset.sortKey!), tops, heights, i0, shift, grab: contentY(clientY) - tops[i0], target: i0, lastClientY: clientY, startClientY: clientY };
    void size;
    dragActive = true;
    root.classList.add('dragging-on');
    el.classList.add('lifted');
    for (const m of members[i0]) {
      m.style.zIndex = '10';
      m.style.transition = 'none';
      m.style.position = 'relative';
    }
    el.style.boxShadow = '0 10px 26px rgba(25,40,59,0.18), 0 2px 6px rgba(25,40,59,0.08)';
    opts.onState?.(key);
    loop();
  }

  function place(clientY: number) {
    const s = snap!;
    s.lastClientY = clientY;
    if (Math.abs(clientY - s.startClientY) > 6) s.moved = true;
    const y = contentY(clientY) - s.grab; // つかんだ行の上端（内容の座標）
    const dy = y - s.tops[s.i0];
    setT(s.members[s.i0], tr(dy));
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
      setT(s.members[k], t ? tr(t) : '');
    }
  }

  /** 端に近づいたら自動でスクロール */
  function loop() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (!snap) return;
      if (X) {
        raf = requestAnimationFrame(step);
        return;
      }
      const r = opts.scroller.getBoundingClientRect();
      const edge = Math.min(48, r.height / 6);
      const y = snap.lastClientY;
      let v = 0;
      // 端の近くでつかんだだけではスクロールしない（その向きへ動かしたときだけ）
      if (y < r.top + edge && y < snap.startClientY - 8) v = -Math.ceil(((r.top + edge - y) / edge) * 14);
      else if (y > r.bottom - edge && y > snap.startClientY + 8) v = Math.ceil(((y - (r.bottom - edge)) / edge) * 14);
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
    const mine = s.members[s.i0];
    const hold = commit && !s.moved && s.target === s.i0;
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
      for (const ms of s.members) setT(ms, '');
      for (const m of mine) {
        m.style.zIndex = '';
        m.style.position = '';
        m.style.transition = '';
      }
      el.style.boxShadow = '';
      el.classList.remove('lifted');
      root.classList.remove('dragging-on');
      dragActive = false;
      opts.onState?.(null);
      if (hold) opts.onHold?.(s.key, el);
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('drag-settle')));
    };
    for (const m of mine) m.style.transition = `transform var(--t-move) var(--ease), box-shadow var(--t-move) ease`;
    el.style.boxShadow = '';
    const to = tr(dest - s.tops[s.i0]);
    const fallback = setTimeout(settle, 320);
    if (el.style.transform === to || !el.style.transform) {
      settle();
      return;
    }
    el.addEventListener('transitionend', settle);
    setT(mine, to);
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
    origin = { x: t.clientX, y: t.clientY };
    timer = setTimeout(() => {
      if (!pending) return;
      const p = pending;
      timer = null;
      pending = null;
      begin(p.el, X ? p.x : p.y);
    }, press);
  };
  const onTouchMove = (e: TouchEvent) => {
    if (snap) {
      e.preventDefault();
      const t = Array.from(e.touches)[0];
      if (t) {
        drift(t.clientX, t.clientY);
        place(pos(t));
      }
      return;
    }
    if (pending) {
      const t = e.touches[0];
      if (Math.hypot(t.clientX - pending.x, t.clientY - pending.y) > 8) clearPending();
    }
  };
  const onTouchEnd = (e: TouchEvent) => {
    const t = e.changedTouches?.[0];
    if (t) drift(t.clientX, t.clientY);
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
    origin = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      if (!pending) return;
      const p = pending;
      timer = null;
      pending = null;
      begin(p.el, X ? p.x : p.y);
    }, press);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (snap) {
      e.preventDefault();
      drift(e.clientX, e.clientY);
      place(pos(e));
      return;
    }
    if (pending && !pending.touch && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 5) {
      const p = pending;
      clearPending();
      begin(p.el, X ? p.x : p.y, true);
      if (snap) place(pos(e));
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
  // タッチの移動は、この領域で始まったタッチだけ受け取る（window に置くと、画面のどこをスクロールしても毎回この処理を待つため、スクロールがカクつく）
  root.addEventListener('touchmove', onTouchMove, { passive: false });
  root.addEventListener('touchend', onTouchEnd, { passive: false });
  root.addEventListener('touchcancel', onTouchCancel);
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
    root.removeEventListener('touchmove', onTouchMove);
    root.removeEventListener('touchend', onTouchEnd);
    root.removeEventListener('touchcancel', onTouchCancel);
    root.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKey);
    opts.scroller.removeEventListener('scroll', onScroll);
    root.removeEventListener('click', onClickCapture, true);
    root.removeEventListener('contextmenu', onContext);
  };
}

/**
 * ガントのバーの移動・伸縮。
 *  - マウス: そのまま押して動かす（3px 以上で開始）
 *  - タッチ: いつも長押し（250ms）で開始。それまでに指を動かしたら横スクロールとして扱う
 *    （横にスワイプしただけで日付が変わらないように。選択中の行は両端の長押しで開始日・期限を変えられる）
 * 操作中はプレビューの枠と日付の吹き出しだけを動かし、指を離したときに1回だけ保存する。
 */
import { shortDate, workdays } from '../../model/dates';
import { dragActive } from '../drag/sortable';
import type { GanttGeom } from './Gantt';
import { previewRange } from './Gantt';

type Kind = 'move' | 'l' | 'r';

interface Active {
  bar: HTMLElement;
  id: string;
  kind: Kind;
  start: string;
  end: string;
  ww: boolean;
  x0: number;
  scroll0: number;
  lastX: number;
  preview: HTMLElement;
  tip: HTMLElement;
  cur: { start: string; end: string };
}

export interface BarDragOptions {
  /** 動かす単位（日）。大日程は 7（1週ずつ） */
  unit?: number;
  /** 動かした結果をそろえる（大日程: 週の初めと終わり） */
  snap?: (start: string, end: string) => { start: string; end: string };
  /** 吹き出しの文字 */
  tip?: (start: string, end: string, ww: boolean) => string;
}

export function attachBarDrag(root: HTMLElement, scroller: HTMLElement, geom: () => Pick<GanttGeom, 'from' | 'dayW' | 'nameW'>, onCommit: (id: string, start: string, end: string) => void, opts: BarDragOptions = {}): () => void {
  const unit = opts.unit ?? 1;
  let pending: { bar: HTMLElement; kind: Kind; x: number; y: number; touch: boolean } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let act: Active | null = null;
  let raf = 0;
  let suppress = false;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  function begin(bar: HTMLElement, kind: Kind, x: number) {
    const g = geom();
    const start = bar.dataset.start!;
    const end = bar.dataset.end!;
    const track = bar.parentElement!;
    const preview = document.createElement('div');
    preview.className = 'gprev';
    preview.style.setProperty('--bar', bar.style.getPropertyValue('--bar'));
    const tip = document.createElement('div');
    tip.className = 'gtip';
    track.appendChild(preview);
    track.appendChild(tip);
    bar.classList.add('active', 'dim');
    act = { bar, id: bar.dataset.bar!, kind, start, end, ww: bar.dataset.ww === '1', x0: x, scroll0: scroller.scrollLeft, lastX: x, preview, tip, cur: { start, end } };
    paint(g);
    loop();
  }

  function paint(g: Pick<GanttGeom, 'from' | 'dayW' | 'nameW'>) {
    const a = act!;
    const dx = a.lastX - a.x0 + (scroller.scrollLeft - a.scroll0);
    const delta = Math.round(dx / g.dayW / unit) * unit;
    const r = previewRange(a.kind, a.start, a.end, delta, a.ww);
    a.cur = opts.snap ? opts.snap(r.start, r.end) : r;
    const left = (Date.parse(`${a.cur.start}T00:00:00Z`) - Date.parse(`${g.from}T00:00:00Z`)) / 86_400_000;
    const days = (Date.parse(`${a.cur.end}T00:00:00Z`) - Date.parse(`${a.cur.start}T00:00:00Z`)) / 86_400_000 + 1;
    a.preview.style.left = `${left * g.dayW}px`;
    a.preview.style.width = `${days * g.dayW}px`;
    a.tip.style.left = `${(left + days / 2) * g.dayW}px`;
    a.tip.style.top = '0px';
    a.tip.textContent = opts.tip ? opts.tip(a.cur.start, a.cur.end, a.ww) : `${shortDate(a.cur.start)}〜${shortDate(a.cur.end)}・${workdays(a.cur.start, a.cur.end, a.ww)}日`;
  }

  /** 端に近づいたら横に自動スクロール */
  function loop() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (!act) return;
      const g = geom();
      const r = scroller.getBoundingClientRect();
      const left = r.left + g.nameW;
      const edge = 40;
      let v = 0;
      if (act.lastX < left + edge) v = -Math.ceil(((left + edge - act.lastX) / edge) * 12);
      else if (act.lastX > r.right - edge) v = Math.ceil(((act.lastX - (r.right - edge)) / edge) * 12);
      if (v) {
        const b = scroller.scrollLeft;
        scroller.scrollLeft = b + v;
        if (scroller.scrollLeft !== b) paint(g);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function finish(save: boolean) {
    const a = act;
    if (!a) return;
    act = null;
    cancelAnimationFrame(raf);
    a.preview.remove();
    a.tip.remove();
    a.bar.classList.remove('active', 'dim');
    suppress = true;
    setTimeout(() => (suppress = false), 400);
    if (save && (a.cur.start !== a.start || a.cur.end !== a.end)) onCommit(a.id, a.cur.start, a.cur.end);
  }

  const find = (t: EventTarget | null): { bar: HTMLElement; kind: Kind } | null => {
    const el = t as Element | null;
    const bar = el?.closest?.<HTMLElement>('[data-bar]');
    if (!bar || !root.contains(bar)) return null;
    const h = el!.closest<HTMLElement>('[data-handle]');
    return { bar, kind: (h?.dataset.handle as Kind) ?? 'move' };
  };
  const isSelected = (bar: HTMLElement) => bar.closest('[aria-selected="true"]') != null;

  const onTouchStart = (e: TouchEvent) => {
    if (act || dragActive || e.touches.length > 1) return clear();
    const f = find(e.target);
    if (!f) return;
    const t = e.touches[0];
    pending = { ...f, x: t.clientX, y: t.clientY, touch: true };
    // 両端（伸縮）は選択中の行だけ。選択していない行は全体の移動
    if (f.kind !== 'move' && !isSelected(f.bar)) pending.kind = 'move';
    timer = setTimeout(() => {
      if (!pending) return;
      const p = pending;
      clear();
      begin(p.bar, p.kind, p.x);
      navigator.vibrate?.(8);
    }, 250);
  };
  const onTouchMove = (e: TouchEvent) => {
    if (act) {
      e.preventDefault();
      act.lastX = e.touches[0].clientX;
      paint(geom());
      return;
    }
    if (pending) {
      const t = e.touches[0];
      if (Math.hypot(t.clientX - pending.x, t.clientY - pending.y) > 8) clear();
    }
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (act) {
      e.preventDefault();
      finish(true);
    }
    clear();
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || e.button !== 0 || act) return;
    const f = find(e.target);
    if (!f) return;
    e.preventDefault();
    pending = { ...f, x: e.clientX, y: e.clientY, touch: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (act) {
      act.lastX = e.clientX;
      paint(geom());
      return;
    }
    if (pending && !pending.touch && Math.abs(e.clientX - pending.x) > 3) {
      const p = pending;
      clear();
      begin(p.bar, p.kind, p.x);
      act!.lastX = e.clientX;
      paint(geom());
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (act) finish(true);
    clear();
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish(false);
  const onScroll = () => pending?.touch && clear();
  const onClick = (e: MouseEvent) => {
    if (suppress) {
      suppress = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  root.addEventListener('touchstart', onTouchStart, { passive: true });
  // タッチの移動は、この領域で始まったタッチだけ受け取る（window に置くと、画面のどこをスクロールしても毎回この処理を待つため、スクロールがカクつく）
  root.addEventListener('touchmove', onTouchMove, { passive: false });
  root.addEventListener('touchend', onTouchEnd, { passive: false });
  const onTouchCancel = () => finish(false);
  root.addEventListener('touchcancel', onTouchCancel);
  root.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKey);
  scroller.addEventListener('scroll', onScroll, { passive: true });
  root.addEventListener('click', onClick, true);
  return () => {
    finish(false);
    clear();
    root.removeEventListener('touchstart', onTouchStart);
    root.removeEventListener('touchmove', onTouchMove);
    root.removeEventListener('touchend', onTouchEnd);
    root.removeEventListener('touchcancel', onTouchCancel);
    root.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKey);
    scroller.removeEventListener('scroll', onScroll);
    root.removeEventListener('click', onClick, true);
  };
}


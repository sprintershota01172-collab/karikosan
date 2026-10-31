/**
 * 左へスワイプすると後ろからボタンが出る行（iPhone のメールと同じ）。
 *  - 少しスワイプ → ボタンが出たまま止まる（もう一度触るとしまう）
 *  - 大きくスワイプ（行の6割以上、かつボタンの幅より十分先まで）→ いちばん右のボタン（削除）をそのまま実行
 *  - 縦の動きはスクロール、長押しは並べ替え（並べ替え中はスワイプしない）
 * 動かすのは前面の1枚（transform）だけ。行そのもの（並べ替えの対象）には触らない。
 */
import React, { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { dragActive } from '../drag/sortable';
import { Icon } from '../icons';

export interface SwipeAction {
  label: string;
  icon: string;
  /** 色: danger = 赤、later = 灰、hide = 紺 */
  tone: 'danger' | 'later' | 'hide';
  run: () => void;
}

/** 開いている行は1つだけ（別の行を開いたら前の行はしまう） */
let closeOpen: (() => void) | null = null;

const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 15;
const BTN = 4.25; // rem（ボタン1つの幅）

export function SwipeRow({ actions, children, flip, testId, edge = '' }: { actions: SwipeAction[]; children: ReactNode; flip?: string; testId?: string; edge?: string }) {
  const front = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const g = useRef<{ x: number; y: number; dx: number; dir: 'h' | 'v' | null; id: number; base: number } | null>(null);
  const swiped = useRef(0);
  const full = actions[actions.length - 1];

  const setX = (px: number, moving: boolean) => {
    const el = front.current;
    if (!el) return;
    el.classList.toggle('moving', moving);
    el.style.transform = px ? `translate3d(${px}px,0,0)` : '';
  };
  const width = () => actions.length * BTN * remPx();
  const close = () => {
    setOpen(false);
    setX(0, false);
    setTimeout(() => setShown(false), 240);
    if (closeOpen === close) closeOpen = null;
  };
  const doOpen = () => {
    if (closeOpen && closeOpen !== close) closeOpen();
    closeOpen = close;
    setOpen(true);
    setShown(true);
    setX(-width(), false);
  };
  const runFull = () => {
    const el = front.current;
    if (el) {
      el.classList.remove('moving');
      el.style.transform = `translate3d(${-(el.offsetWidth + 16)}px,0,0)`;
    }
    if (closeOpen === close) closeOpen = null;
    setTimeout(() => full.run(), 160);
  };

  return (
    <div className={`swipe${shown ? ' shown' : ''}${edge}`} data-flip={flip} data-testid={testId}>
      <div className="actions" aria-hidden={open ? 'false' : 'true'}>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className={a.tone}
            tabIndex={open ? 0 : -1}
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              close();
              a.run();
            }}
          >
            <Icon name={a.icon} size={18} />
            {a.label}
          </button>
        ))}
      </div>
      <div
        className="front"
        ref={front}
        onPointerDown={(e: PointerEvent) => {
          if (e.button !== 0 || (e.target as Element).closest('[data-no-drag], button, input, select, textarea')) return;
          g.current = { x: e.clientX, y: e.clientY, dx: 0, dir: null, id: e.pointerId, base: open ? -width() : 0 };
        }}
        onPointerMove={(e: PointerEvent) => {
          const s = g.current;
          if (!s || s.id !== e.pointerId) return;
          if (dragActive) {
            g.current = null;
            return;
          }
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (!s.dir && Math.hypot(dx, dy) > 8) s.dir = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
          if (s.dir !== 'h') return;
          if (!shown) setShown(true);
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          const w = (e.currentTarget as HTMLElement).offsetWidth;
          // 右へは動かさない。左は行の幅まで（ボタンの幅を超えたら少し重く）
          let x = Math.min(0, s.base + dx);
          if (x < -width()) x = -width() + (x + width()) * 0.85;
          s.dx = Math.max(-w, x);
          setX(s.dx, true);
        }}
        onPointerUp={(e: PointerEvent) => {
          const s = g.current;
          g.current = null;
          if (!s || s.dir !== 'h') return;
          swiped.current = Date.now();
          const w = (e.currentTarget as HTMLElement).offsetWidth;
          // ボタンを出すつもりのスワイプで消えないよう、ボタンの幅より十分に大きく動かしたときだけ
          if (s.dx < -Math.max(w * 0.6, width() + 4 * remPx())) return runFull();
          if (s.dx < -remPx() * 3) doOpen();
          else close();
        }}
        onPointerCancel={() => {
          const s = g.current;
          g.current = null;
          if (s?.dir === 'h') (open ? doOpen() : close());
        }}
        onClickCapture={(e: MouseEvent) => {
          // スワイプの直後の「タップ」と、開いている行のタップ（= しまう）は、行の操作にしない
          if (Date.now() - swiped.current < 350 || open) {
            e.stopPropagation();
            e.preventDefault();
            if (open && Date.now() - swiped.current >= 350) close();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

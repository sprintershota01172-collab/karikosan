/**
 * ガント・大日程のスクロールバー。
 * 標準のスクロールバーは枠の角や名前の列の下にも出て、動く範囲（日付の部分）と合わないので隠し、
 *  - 横: 日付の部分の真下だけに細い棒（つまんで動かせる。棒の外をタップするとそこへ移動）
 *  - 縦: 行が入りきらないときだけ、見出しより下の右端に細い棒
 * を自前で描く。
 */
import React, { useEffect, useRef, useState } from 'react';

export const SB_PX = 10;

export function ScrollBars({ scroller, left, top }: { scroller: { current: HTMLElement | null }; left: number; top: number }) {
  const [s, setS] = useState({ sl: 0, sw: 1, cw: 1, st: 0, sh: 1, ch: 1 });
  const track = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const n = { sl: sc.scrollLeft, sw: sc.scrollWidth, cw: sc.clientWidth, st: sc.scrollTop, sh: sc.scrollHeight, ch: sc.clientHeight };
      setS((p) => (p.sl === n.sl && p.sw === n.sw && p.cw === n.cw && p.st === n.st && p.sh === n.sh && p.ch === n.ch ? p : n));
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    sc.addEventListener('scroll', on, { passive: true });
    const ro = new ResizeObserver(on);
    ro.observe(sc);
    if (sc.firstElementChild) ro.observe(sc.firstElementChild);
    return () => {
      cancelAnimationFrame(raf);
      sc.removeEventListener('scroll', on);
      ro.disconnect();
    };
  }, [scroller.current]);

  // 横: 日付の部分（名前の列を除く）に対する割合
  const viewW = Math.max(1, s.cw - left);
  const contW = Math.max(1, s.sw - left);
  const hTrack = Math.max(1, s.cw - left);
  const hThumb = Math.max(28, (viewW / contW) * hTrack);
  const hMax = Math.max(1, s.sw - s.cw);
  const hPos = (s.sl / hMax) * (hTrack - hThumb);
  const showH = s.sw > s.cw + 1;
  // 縦
  const vTrack = Math.max(1, s.ch - top);
  const vThumb = Math.max(24, ((s.ch - top) / Math.max(1, s.sh - top)) * vTrack);
  const vMax = Math.max(1, s.sh - s.ch);
  const vPos = (s.st / vMax) * (vTrack - vThumb);
  const showV = s.sh > s.ch + 1;

  const drag = (e: PointerEvent) => {
    const sc = scroller.current;
    const tr = track.current;
    if (!sc || !tr) return;
    e.preventDefault();
    e.stopPropagation();
    const r = tr.getBoundingClientRect();
    const onThumb = (e.target as Element).classList.contains('sb-thumb');
    const ratio = hMax / Math.max(1, hTrack - hThumb);
    // 棒の外を押したら、そこが棒の真ん中になるように移動してから、そのままつまんで動かせる
    if (!onThumb) sc.scrollLeft = (e.clientX - r.left - hThumb / 2) * ratio;
    const x0 = e.clientX;
    const l0 = sc.scrollLeft;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);
    el.classList.add('active');
    const move = (m: PointerEvent) => (sc.scrollLeft = l0 + (m.clientX - x0) * ratio);
    const up = () => {
      el.classList.remove('active');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return (
    <>
      <div className={`sb-h${showH ? '' : ' off'}`} ref={track} style={{ left: `${left}px` }} onPointerDown={drag} data-testid="hbar" aria-hidden="true">
        <div className="sb-thumb" style={{ width: `${hThumb}px`, transform: `translateX(${hPos}px)` }} />
      </div>
      {showV && (
        <div className="sb-v" style={{ top: `${top}px`, bottom: `${SB_PX}px` }} aria-hidden="true">
          <div className="sb-thumb" style={{ height: `${vThumb}px`, transform: `translateY(${vPos}px)` }} />
        </div>
      )}
    </>
  );
}

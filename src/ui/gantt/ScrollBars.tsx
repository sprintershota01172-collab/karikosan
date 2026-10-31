/**
 * ガント・大日程のスクロールバー。
 * 標準のスクロールバーは枠の角や名前の列の下にも出て、動く範囲（日付の部分）と合わないので隠し、
 *  - 横: 日付の部分の真下だけに細い棒（つまんで動かせる。棒の外をタップするとそこへ移動）
 *  - 縦: 行が入りきらないときだけ、見出しより下の右端に細い棒
 * を自前で描く。
 */
import React, { useEffect, useRef } from 'react';

export const SB_PX = 10;

/** スクロールのたびに React で描き直さず、棒の位置だけを直接動かす（スクロールを滑らかに保つ） */
export function ScrollBars({ scroller, left, top }: { scroller: { current: HTMLElement | null }; left: number; top: number }) {
  const track = useRef<HTMLDivElement | null>(null);
  const hThumb = useRef<HTMLDivElement | null>(null);
  const vBox = useRef<HTMLDivElement | null>(null);
  const vThumb = useRef<HTMLDivElement | null>(null);
  const geo = useRef({ hMax: 1, hTrack: 1, hThumb: 28 });
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const sl = sc.scrollLeft;
      const sw = sc.scrollWidth;
      const cw = sc.clientWidth;
      const hTrack = Math.max(1, cw - left);
      const hT = Math.max(28, (Math.max(1, cw - left) / Math.max(1, sw - left)) * hTrack);
      const hMax = Math.max(1, sw - cw);
      geo.current = { hMax, hTrack, hThumb: hT };
      if (track.current) track.current.classList.toggle('off', sw <= cw + 1);
      if (hThumb.current) {
        hThumb.current.style.width = `${hT}px`;
        hThumb.current.style.transform = `translate3d(${(sl / hMax) * (hTrack - hT)}px,0,0)`;
      }
      const st = sc.scrollTop;
      const sh = sc.scrollHeight;
      const ch = sc.clientHeight;
      const vTrack = Math.max(1, ch - top);
      const vT = Math.max(24, (vTrack / Math.max(1, sh - top)) * vTrack);
      if (vBox.current) vBox.current.style.display = sh > ch + 1 ? '' : 'none';
      if (vThumb.current) {
        vThumb.current.style.height = `${vT}px`;
        vThumb.current.style.transform = `translate3d(0,${(st / Math.max(1, sh - ch)) * (vTrack - vT)}px,0)`;
      }
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
  }, [scroller.current, left, top]);

  const drag = (e: PointerEvent) => {
    const sc = scroller.current;
    const tr = track.current;
    if (!sc || !tr) return;
    e.preventDefault();
    e.stopPropagation();
    const { hMax, hTrack, hThumb: hT } = geo.current;
    const r = tr.getBoundingClientRect();
    const onThumb = (e.target as Element).classList.contains('sb-thumb');
    const ratio = hMax / Math.max(1, hTrack - hT);
    // 棒の外を押したら、そこが棒の真ん中になるように移動してから、そのままつまんで動かせる
    if (!onThumb) sc.scrollLeft = (e.clientX - r.left - hT / 2) * ratio;
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
      <div className="sb-h" ref={track} style={{ left: `${left}px` }} onPointerDown={drag} data-testid="hbar" aria-hidden="true">
        <div className="sb-thumb" ref={hThumb} />
      </div>
      <div className="sb-v" ref={vBox} style={{ top: `${top}px`, bottom: `${SB_PX}px`, display: 'none' }} aria-hidden="true">
        <div className="sb-thumb" ref={vThumb} />
      </div>
    </>
  );
}

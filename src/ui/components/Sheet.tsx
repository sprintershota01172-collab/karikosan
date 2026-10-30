import React, { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { closeSheet } from '../../store/store';
import { Icon } from '../icons';
import { revealIn } from '../reveal';

/**
 * 下から出る入力画面（PC では中央のダイアログ）。中身だけをスクロールする。
 * スマホでは上まで広げて入力欄を画面の上側に置く（キーボードが出ても画面がずれない）。
 * キーボードが出たら、下端をキーボードの上に合わせる（App の useKeyboardFit が --kb・--vv-top を決める）。
 */
export function Sheet({ title, children, foot, closing, onClose, right, short }: { title: string; children?: ReactNode; foot?: ReactNode; closing?: boolean; onClose?: () => void; right?: ReactNode; short?: boolean }) {
  const close = onClose ?? closeSheet;
  const body = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return (
    <>
      <div className={`backdrop${closing ? ' closing' : ''}`} onClick={close} />
      <div className={`sheet${closing ? ' closing' : ''}${short ? '' : ' tall'}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2 className="ellipsis">{title}</h2>
          {right}
          <button type="button" className="iconbtn" onClick={close} aria-label="閉じる">
            <Icon name="close" />
          </button>
        </div>
        <div
          className="sheet-body"
          ref={body}
          onFocus={(e: FocusEvent) => {
            // キーボードで隠れないよう、入力欄を見える位置へ
            const el = e.target as HTMLElement;
            setTimeout(() => revealIn(el), 280);
          }}
        >
          {children}
        </div>
        {foot && <div className="sheet-foot">{foot}</div>}
      </div>
    </>
  );
}

import React, { useEffect } from 'react';
import type { ReactNode } from 'react';
import { closeSheet } from '../../store/store';
import { Icon } from '../icons';

/**
 * 下から出る入力画面（PC では中央のダイアログ）。中身だけをスクロールする。
 * キーボードが出たときは visualViewport に合わせて高さを縮め、入力欄が隠れないようにする。
 */
export function Sheet({ title, children, foot, closing, onClose, right }: { title: string; children?: ReactNode; foot?: ReactNode; closing?: boolean; onClose?: () => void; right?: ReactNode }) {
  const close = onClose ?? closeSheet;
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const fit = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
      document.documentElement.style.setProperty('--kb', `${kb}px`);
    };
    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    return () => {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
      document.documentElement.style.removeProperty('--vvh');
      document.documentElement.style.removeProperty('--kb');
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return (
    <>
      <div className={`backdrop${closing ? ' closing' : ''}`} onClick={close} />
      <div className={`sheet${closing ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2 className="ellipsis">{title}</h2>
          {right}
          <button type="button" className="iconbtn" onClick={close} aria-label="閉じる">
            <Icon name="close" />
          </button>
        </div>
        <div
          className="sheet-body"
          onFocus={(e: FocusEvent) => {
            // キーボードで隠れないよう、入力欄を見える位置へ
            const el = e.target as HTMLElement;
            setTimeout(() => el.scrollIntoView?.({ block: 'nearest' }), 280);
          }}
        >
          {children}
        </div>
        {foot && <div className="sheet-foot">{foot}</div>}
      </div>
    </>
  );
}

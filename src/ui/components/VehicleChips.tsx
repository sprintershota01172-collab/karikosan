/**
 * 車種の切り替え（ワンタップ）。横に入りきらない分は「他N」にまとめ、横スクロールはさせない。
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { setSettings } from '../../model/actions';
import { commit, openSheet, useData } from '../../store/store';
import { Icon } from '../icons';

export function VehicleChips() {
  const vehicles = useData((d) => d.vehicles);
  const cur = useData((d) => d.settings.vehicle);
  const list = [...vehicles].sort((a, b) => a.order - b.order);
  const ref = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState(list.length);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const chips = Array.from(el.querySelectorAll<HTMLElement>('[data-vchip]'));
      const more = 64;
      let n = 0;
      for (const c of chips) {
        const right = c.offsetLeft + c.offsetWidth;
        if (right <= w - (n + 1 < chips.length ? more : 0)) n++;
        else break;
      }
      setFit(Math.max(0, n - 1)); // 先頭は「すべて」
    };
    // いったん全部並べて測る
    setFit(list.length);
    requestAnimationFrame(measure);
    const ro = new ResizeObserver(() => {
      setFit(list.length);
      requestAnimationFrame(measure);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [list.length, list.map((v) => v.name).join('|')]);
  const set = (v: string) => commit((d) => setSettings(d, { vehicle: v }), { undoable: false });
  const shown = list.slice(0, fit);
  const hidden = list.slice(fit);
  const curHidden = hidden.find((v) => v.id === cur);
  return (
    <div className="chips" ref={ref} role="group" aria-label="車種">
      <button type="button" className="chip" data-vchip aria-pressed={cur === 'all' ? 'true' : 'false'} onClick={() => set('all')}>
        すべて
      </button>
      {shown.map((v) => (
        <button key={v.id} type="button" className="chip" data-vchip aria-pressed={cur === v.id ? 'true' : 'false'} onClick={() => set(v.id)}>
          <i className="dot" style={{ background: v.color }} />
          <span>{v.name}</span>
        </button>
      ))}
      {hidden.length > 0 && (
        <button type="button" className="chip" aria-pressed={curHidden ? 'true' : 'false'} onClick={() => openSheet('vehiclePick')}>
          {curHidden ? (
            <>
              <i className="dot" style={{ background: curHidden.color }} />
              <span>{curHidden.name}</span>
            </>
          ) : (
            <span>他{hidden.length}</span>
          )}
          <Icon name="down" size={14} />
        </button>
      )}
      {list.length === 0 && (
        <button type="button" className="chip" onClick={() => openSheet('vehicle', {})}>
          <Icon name="plus" size={14} />
          <span>車種を追加</span>
        </button>
      )}
    </div>
  );
}

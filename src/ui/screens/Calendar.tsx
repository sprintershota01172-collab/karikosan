/**
 * 予定: コンパクトな月表示＋選んだ日からの予定一覧。左右スワイプで月を移動し、変わるのは日付の部分だけ。
 */
import React, { useMemo, useRef, useState } from 'react';
import { addDays, addMonths, daysInMonth, monthOf, monthStart, shortDate, startOfWeek, toDay, today, weekday } from '../../model/dates';
import { occurrences, REPEAT_LABEL } from '../../model/recur';
import { openSheet, useData } from '../../store/store';
import { Reveal } from '../components/bits';
import { PagerBar, usePager } from '../components/Pager';
import { Icon } from '../icons';
import { vehicleColor } from '../view';

const WD = ['月', '火', '水', '木', '金', '土', '日'];

export function Calendar() {
  const data = useData((d) => d);
  const day = today();
  const [ym, setYm] = useState(() => monthOf(day));
  const [sel, setSel] = useState(day);
  const [dir, setDir] = useState(0);
  const [seq, setSeq] = useState(0);
  // 予定は車種をまたいで全部を表示する（車種は色で見分ける）
  const vehicle = 'all';

  const first = monthStart(ym.y, ym.m);
  const gridStart = startOfWeek(first);
  const lastDay = `${ym.y}-${String(ym.m).padStart(2, '0')}-${String(daysInMonth(ym.y, ym.m)).padStart(2, '0')}`;
  const weeks = Math.ceil((toDay(lastDay) - toDay(gridStart) + 1) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));

  const occ = useMemo(() => occurrences(data, cells[0], cells[cells.length - 1], vehicle), [data, cells[0], cells.length, vehicle]);
  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of occ) m.set(o.date, (m.get(o.date) ?? 0) + 1);
    return m;
  }, [occ]);
  const dueByDay = useMemo(() => {
    const m = new Set<string>();
    for (const t of data.tasks) if (!t.done && t.due && (vehicle === 'all' || t.vehicleId === vehicle)) m.add(t.due);
    return m;
  }, [data.tasks, vehicle]);
  // 選んだ日から2週間の予定（画面に5件以上見える）
  const list = useMemo(() => occurrences(data, sel, addDays(sel, 13), vehicle), [data, sel, vehicle]);
  const listBox = useRef<HTMLDivElement | null>(null);
  const lp = usePager(listBox, true, { item: '.erow', stops: '.erow' });

  const go = (n: number) => {
    setDir(n);
    setSeq((s) => s + 1);
    const nm = addMonths(ym.y, ym.m, n);
    setYm(nm);
    // 選んだ日も同じ日付の月へ
    const d = Math.min(Number(sel.slice(8, 10)), daysInMonth(nm.y, nm.m));
    setSel(`${nm.y}-${String(nm.m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  };
  const toToday = () => {
    const t = monthOf(day);
    setDir(t.y * 12 + t.m > ym.y * 12 + ym.m ? 1 : -1);
    setSeq((s) => s + 1);
    setYm(t);
    setSel(day);
  };
  const touch = useRef<{ x: number; y: number } | null>(null);

  return (
    <div className="screen">
      <div className="cal-head">
        <h2 className="num">
          {ym.y}年{ym.m}月
        </h2>
        <button type="button" className="iconbtn" aria-label="前の月" onClick={() => go(-1)}>
          <Icon name="left" />
        </button>
        <button type="button" className="btn small" onClick={toToday}>
          今日
        </button>
        <button type="button" className="iconbtn" aria-label="次の月" onClick={() => go(1)}>
          <Icon name="right" />
        </button>
      </div>
      <div
        className="cal-grid"
        onTouchStart={(e: TouchEvent) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e: TouchEvent) => {
          const s = touch.current;
          touch.current = null;
          if (!s) return;
          const dx = e.changedTouches[0].clientX - s.x;
          const dy = e.changedTouches[0].clientY - s.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
        }}
      >
        <div className="cal-month" style={{ gridAutoRows: 'auto' }}>
          {WD.map((w, i) => (
            <div key={w} className={`cal-wd${i === 6 ? ' sun' : ''}`}>
              {w}
            </div>
          ))}
        </div>
        <div key={seq} className={`cal-month${seq ? ' in' : ''}${dir < 0 ? ' back' : ''}`} data-testid="cal-month">
          {cells.map((d) => {
            const wd = weekday(d);
            const n = byDay.get(d) ?? 0;
            return (
              <button
                key={d}
                type="button"
                className={`cal-day${d.slice(0, 7) !== first.slice(0, 7) ? ' other' : ''}${wd === 0 ? ' sun' : wd === 6 ? ' sat' : ''}${d === day ? ' today' : ''}`}
                aria-selected={d === sel ? 'true' : 'false'}
                aria-label={`${shortDate(d)}${n ? ` 予定${n}件` : ''}`}
                onClick={() => setSel(d)}
                onDblClick={() => openSheet('event', { date: d })}
              >
                <span className="n num">{Number(d.slice(8, 10))}</span>
                <span className="dots">
                  {Array.from({ length: Math.min(3, n) }, (_, i) => (
                    <i key={i} />
                  ))}
                  {dueByDay.has(d) && <i className="t" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="section-head">
        <span>{sel === day ? '今日' : shortDate(sel)}からの予定</span>
        <span className="count num">{list.length}件</span>
        <span className="grow" />
        <button type="button" className="btn small primary" onClick={() => openSheet('event', { date: sel })}>
          <Icon name="plus" size={16} />
          予定
        </button>
      </div>
      <div className="scroll" style={{ paddingBottom: '0.5rem' }} ref={listBox}>
        {list.length === 0 && <div className="empty">予定はありません。「＋予定」から追加できます</div>}
        {list.map((o) => (
          <button key={o.key} type="button" className="erow" onClick={() => openSheet('event', { id: o.event.id })}>
            <span className="time num">
              {o.date === day ? '今日' : shortDate(o.date)}
              <small>{o.event.startTime ? `${o.event.startTime}${o.event.endTime ? `–${o.event.endTime}` : ''}` : '終日'}</small>
            </span>
            <span className="bar" style={{ background: vehicleColor(data, o.event.vehicleId) }} />
            <span className="grow" style={{ minWidth: 0 }}>
              <Reveal text={o.event.title || '予定'} className="t" />
              <span className="micro ellipsis" style={{ display: 'block' }}>
                {[o.event.place, o.event.repeat !== 'none' ? REPEAT_LABEL[o.event.repeat] : ''].filter(Boolean).join('・')}
              </span>
            </span>
          </button>
        ))}
      </div>
      <PagerBar p={lp} />
    </div>
  );
}


/** ホーム: 今日のタスクと直近の予定 */
import React, { useMemo, useRef, useState } from 'react';
import { addTask, hideToday, postpone, unhideToday } from '../../model/actions';
import { addDays, shortDate, today } from '../../model/dates';
import { priorityOf } from '../../model/priority';
import { occurrences } from '../../model/recur';
import { todayList } from '../../model/rows';
import type { Task } from '../../model/types';
import { commit, openSheet, setTab, setUI, useData } from '../../store/store';
import { Check, PrioBadge, Reveal } from '../components/bits';
import { PagerBar, usePager } from '../components/Pager';
import { completeTask, dueLabel } from '../components/TaskList';
import { Icon } from '../icons';
import { vehicleColor } from '../view';
import { QuickAdd } from './Tasks';

/** 左へスワイプすると「延期」「除外」が出る行 */
function SwipeTask({ t, color }: { t: Task; color: string }) {
  const front = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const g = useRef<{ x: number; y: number; dx: number; dir: 'h' | 'v' | null; id: number } | null>(null);
  const W = 8.5; // rem（ボタン2つ分）
  const setX = (px: number, moving: boolean) => {
    const el = front.current;
    if (!el) return;
    el.classList.toggle('moving', moving);
    el.style.transform = px ? `translate3d(${px}px,0,0)` : '';
  };
  const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 15;
  const due = dueLabel(t);
  return (
    <div className="swipe" data-flip={t.id} data-pager-item>
      <div className="actions" aria-hidden={open ? 'false' : 'true'}>
        <button type="button" className="later" onClick={() => (setOpen(false), setX(0, false), commit((d) => postpone(d, t.id), { toast: `「${t.title}」を次の作業日に延期` }))}>
          <Icon name="skip" size={18} />
          延期
        </button>
        <button type="button" className="hide" onClick={() => (setOpen(false), setX(0, false), commit((d) => hideToday(d, t.id), { toast: `「${t.title}」を今日の一覧から外しました` }))}>
          <Icon name="hide" size={18} />
          除外
        </button>
      </div>
      <div
        className="front"
        ref={front}
        style={{ touchAction: 'none' }}
        onPointerDown={(e: PointerEvent) => {
          if ((e.target as Element).closest('[data-no-drag]')) return;
          g.current = { x: e.clientX, y: e.clientY, dx: 0, dir: null, id: e.pointerId };
        }}
        onPointerMove={(e: PointerEvent) => {
          const s = g.current;
          if (!s || s.id !== e.pointerId) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (!s.dir && Math.hypot(dx, dy) > 8) s.dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
          if (s.dir !== 'h') return;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          const base = open ? -W * remPx() : 0;
          s.dx = Math.min(0, Math.max(-W * remPx() * 1.15, base + dx));
          setX(s.dx, true);
        }}
        onPointerUp={() => {
          const s = g.current;
          g.current = null;
          if (!s || s.dir !== 'h') return;
          const o = s.dx < -remPx() * 3;
          setOpen(o);
          setX(o ? -W * remPx() : 0, false);
        }}
        onPointerCancel={() => {
          g.current = null;
          setX(open ? -W * remPx() : 0, false);
        }}
      >
        <div className="trow" onClick={() => (open ? (setOpen(false), setX(0, false)) : openSheet('task', { id: t.id }))}>
          <Check on={t.done} label={`${t.title}を完了`} onChange={(v) => completeTask(t, v)} />
          <div className="title">
            <span style={{ width: '0.25rem', height: '1.1rem', borderRadius: 2, background: color, flex: 'none' }} />
            <PrioBadge info={priorityOf(t, today())} />
            <Reveal text={t.title || '無題'} />
          </div>
          <div className="meta">
            {t.progress > 0 && <span className="num">{t.progress}%</span>}
            <span className={`due num ${due.cls}`}>{due.text}</span>
          </div>
          <span style={{ width: '0.75rem', flex: 'none' }} />
        </div>
      </div>
    </div>
  );
}

export function Home() {
  const data = useData((d) => d);
  const day = today();
  const { list, hidden } = useMemo(() => todayList(data, day), [data, day]);
  const events = useMemo(() => occurrences(data, day, addDays(day, 6)).slice(0, 12), [data, day]);
  const [showHidden, setShowHidden] = useState(false);
  const taskBox = useRef<HTMLDivElement | null>(null);
  const eventBox = useRef<HTMLDivElement | null>(null);
  const tp = usePager(taskBox, true, { item: '[data-pager-item]', stops: '.swipe, .add-inline, .trow' });
  const ep = usePager(eventBox, true, { item: '.erow', stops: '.erow' });
  return (
    <div className="screen">
      <div className="section-head">
        <span>今日のタスク</span>
        <span className="count num">{list.length}件</span>
        {list.length > 1 && <span className="micro">優先度の高い順</span>}
        <span className="grow" />
        <span className="micro">{shortDate(day)}</span>
      </div>
      <div className="scroll" style={{ flex: '0 1 auto', maxHeight: '58%' }} ref={taskBox}>
        {list.length === 0 && (
          <div className="empty" style={{ padding: '1.25rem 1rem' }}>
            <div>今日が期限・期間中のタスクはありません</div>
          </div>
        )}
        {list.map((t) => (
          <SwipeTask key={t.id} t={t} color={vehicleColor(data, t.vehicleId)} />
        ))}
        {hidden.length > 0 && (
          <>
            <button type="button" className="add-inline" style={{ paddingLeft: 0 }} onClick={() => setShowHidden(!showHidden)}>
              <Icon name={showHidden ? 'up' : 'down'} size={16} />
              今日の一覧から外したタスク {hidden.length}件
            </button>
            {showHidden &&
              hidden.map((t) => (
                <div key={t.id} className="trow" style={{ opacity: 0.7 }}>
                  <span style={{ width: '2.5rem' }} />
                  <div className="title">
                    <Reveal text={t.title} />
                  </div>
                  <button type="button" className="btn small ghost" onClick={() => commit((d) => unhideToday(d, t.id), { toast: `「${t.title}」を今日の一覧に戻しました` })}>
                    <Icon name="undo" size={16} />
                    戻す
                  </button>
                </div>
              ))}
          </>
        )}
      </div>
      <PagerBar p={tp} />
      <div className="section-head">
        <span>直近の予定</span>
        <span className="count num">{events.length}件</span>
        <span className="grow" />
        <button type="button" className="btn small ghost" onClick={() => setTab('calendar')}>
          カレンダー
          <Icon name="right" size={16} />
        </button>
      </div>
      <div className="scroll" style={{ flex: '1' }} ref={eventBox}>
        {events.length === 0 && <div className="empty" style={{ padding: '1rem' }}>7日以内の予定はありません</div>}
        {events.map((o) => (
          <button key={o.key} type="button" className="erow" onClick={() => openSheet('event', { id: o.event.id })}>
            <span className="time num">
              {o.date === day ? '今日' : shortDate(o.date)}
              <small>{o.event.startTime ? `${o.event.startTime}${o.event.endTime ? `–${o.event.endTime}` : ''}` : '終日'}</small>
            </span>
            <span className="bar" style={{ background: vehicleColor(data, o.event.vehicleId) }} />
            <span className="grow" style={{ minWidth: 0 }}>
              <Reveal text={o.event.title || '予定'} className="t" />
              {o.event.place && <span className="micro ellipsis" style={{ display: 'block' }}>{o.event.place}</span>}
            </span>
          </button>
        ))}
      </div>
      <PagerBar p={ep} />
      <QuickAdd
        placeholder="今日のタスクを追加"
        onAdd={(title) => {
          commit((d) => addTask(d, { title, due: day, vehicleId: d.settings.vehicle === 'all' ? null : d.settings.vehicle }).data);
          setUI({ selected: null });
        }}
      />
    </div>
  );
}

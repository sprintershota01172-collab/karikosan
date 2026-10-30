/**
 * 大日程: 車種ごとのイベント（設計・試作・評価・量産など）を、1マス = 1週のガントで並べる。
 *  - 「すべて」: 車種ごとに重ならないイベントを同じ段に詰めた大日程。上の「負荷」の行で、週ごとの混み具合が分かる
 *  - 車種を選ぶと: その車種のイベントを1行ずつ。負荷の行はその車種だけ
 * バーは長押し（PC はそのまま）で横に動かすと1週ずつ動き、両端で開始・終わりの週を変えられる。
 * 何もない所をタップすると、その週にイベントを追加。
 */
import React, { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { setSettings } from '../../model/actions';
import { addDays, daysInMonth, diffDays, fromDay, monthOf, shortDate, startOfWeek, toDay, today } from '../../model/dates';
import { LOAD_LABEL, LOAD_LEVEL_LABEL, loadLevel, PLAN_KINDS, planRange, planRows, snapWeeks, updatePlan, weeklyLoad, weeksOf, type PlanRow } from '../../model/plan';
import type { ID, PlanEvent } from '../../model/types';
import { commit, getUI, openSheet, setUI, useData, useUI } from '../../store/store';
import { Seg } from '../components/bits';
import { VehicleChips } from '../components/VehicleChips';
import { attachBarDrag } from '../gantt/barDrag';
import { useSize } from '../gantt/Gantt';
import { Icon } from '../icons';

/** 1週の幅（rem）: week = 1マス1週を広く、year = 1年を見渡す */
const WEEK_REM = { week: 2.5, month: 1 } as const;
const HEAD = { month: 1.25, week: 1.375, load: 1.625 };
const rootPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 15;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function PlanScreen() {
  const vehicle = useData((d) => d.settings.vehicle);
  const zoom = useData((d) => d.settings.planZoom);
  const api = useRef<((to: 'today' | 'prev' | 'next') => void) | null>(null);
  return (
    <div className="screen" style={{ paddingBottom: '0.5rem' }}>
      <VehicleChips />
      <div className="toolbar tb-gantt">
        <div className="zoom">
          <Seg value={zoom} onChange={(v) => commit((d) => setSettings(d, { planZoom: v }), { undoable: false })} options={[{ value: 'week', label: '週' }, { value: 'month', label: '年' }]} label="1マスの幅" />
        </div>
        <button type="button" className="chip" aria-label="イベントを追加" onClick={() => openSheet('plan', { vehicleId: vehicle === 'all' ? null : vehicle })}>
          <Icon name="plus" size={14} />
          <span>イベント</span>
        </button>
        <span className="grow" />
        <button type="button" className="iconbtn step" aria-label="前へ" onClick={() => api.current?.('prev')}>
          <Icon name="left" />
        </button>
        <button type="button" className="btn small" onClick={() => api.current?.('today')}>
          今週
        </button>
        <button type="button" className="iconbtn step" aria-label="次へ" onClick={() => api.current?.('next')}>
          <Icon name="right" />
        </button>
      </div>
      <PlanChart vehicle={vehicle} zoom={zoom} api={api} />
      <div className="plan-legend" aria-label="負荷の見かた">
        <span>負荷</span>
        {[1, 2, 3].map((l) => (
          <span key={l} className={`lchip l${l}`}>
            {LOAD_LEVEL_LABEL[l]}
          </span>
        ))}
        <span className="micro grow ellipsis">週ごとのイベントの重み（小1・中2・大3）の合計</span>
      </div>
    </div>
  );
}

interface Geom {
  from: string;
  weeks: number;
  weekW: number;
  dayW: number;
  nameW: number;
  rowH: number;
  headH: number;
}

function PlanChart({ vehicle, zoom, api }: { vehicle: ID | 'all'; zoom: 'week' | 'month'; api: { current: ((to: 'today' | 'prev' | 'next') => void) | null } }) {
  const plans = useData((d) => d.plans);
  const vehicles = useData((d) => d.vehicles);
  const fontStep = useData((d) => d.settings.fontStep);
  const selected = useUI((u) => u.selected);
  const day = today();
  const box = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const size = useSize(box);
  const range = useMemo(() => planRange(plans, day), [plans, day]);
  const rows = useMemo(() => planRows({ plans, vehicles } as Parameters<typeof planRows>[0], vehicle), [plans, vehicles, vehicle]);
  const loads = useMemo(() => weeklyLoad(plans, range.from, range.weeks, vehicle), [plans, range.from, range.weeks, vehicle]);

  const g: Geom = useMemo(() => {
    const px = rootPx();
    const weekW = Math.round(WEEK_REM[zoom] * px * 100) / 100;
    return {
      from: range.from,
      weeks: range.weeks,
      weekW,
      dayW: weekW / 7,
      nameW: Math.round((size.w >= 720 ? 13 : size.w >= 480 ? 9.5 : 7.25) * px),
      rowH: Math.round((vehicle === 'all' ? 2.375 : 2.25) * px),
      headH: (HEAD.month + HEAD.week + HEAD.load) * px,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, range.from, range.weeks, zoom, vehicle, fontStep]);
  const width = g.nameW + g.weeks * g.weekW;
  const x = (d: string) => diffDays(g.from, d) * g.dayW;
  const thisWeek = Math.floor(diffDays(g.from, startOfWeek(day)) / 7);

  // 最初は今週が左から1/4のあたりに。1マスの幅を変えたときは真ん中の週を保つ
  const center = useRef<number | null>(null);
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc || !size.w) return;
    const visible = size.w - g.nameW;
    const c = center.current;
    sc.scrollLeft = Math.max(0, c != null ? (c - toDay(g.from)) * g.dayW - visible / 2 : x(day) - visible / 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.weekW, size.w > 0]);
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const on = () => (center.current = toDay(g.from) + (sc.scrollLeft + (sc.clientWidth - g.nameW) / 2) / g.dayW);
    sc.addEventListener('scroll', on, { passive: true });
    return () => sc.removeEventListener('scroll', on);
  }, [g.from, g.dayW, g.nameW]);
  api.current = (to) => {
    const sc = scroller.current;
    if (!sc) return;
    const visible = sc.clientWidth - g.nameW;
    const left = to === 'today' ? x(day) - visible / 4 : sc.scrollLeft + (to === 'next' ? 1 : -1) * Math.max(visible * 0.8, g.weekW * 4);
    sc.scrollTo({ left: Math.max(0, left), behavior: reduced() ? 'auto' : 'smooth' });
  };

  // バーの移動・伸縮（1週ずつ）
  const gRef = useRef(g);
  gRef.current = g;
  useEffect(() => {
    if (!body.current || !scroller.current) return;
    return attachBarDrag(body.current, scroller.current, () => gRef.current, (id, start, end) => commit((d) => updatePlan(d, id, { start, end })), {
      unit: 7,
      snap: snapWeeks,
      tip: (s, e) => `${shortDate(s, false)}〜${shortDate(e, false)}・${weeksOf({ start: s, end: e })}週`,
    });
  }, [size.w > 0]);

  const months = useMemo(() => {
    const out: { left: number; width: number; label: string }[] = [];
    const end = toDay(g.from) + g.weeks * 7;
    let d = g.from;
    while (toDay(d) < end) {
      const { y, m } = monthOf(d);
      const next = Math.min(end, toDay(d) + daysInMonth(y, m) - (Number(d.slice(8, 10)) - 1));
      out.push({ left: x(d), width: (next - toDay(d)) * g.dayW, label: zoom === 'month' && m !== 1 && out.length ? `${m}月` : `${y}年${m}月` });
      d = fromDay(next);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.from, g.weeks, g.dayW, zoom]);

  /** 何もない所をタップ: 選んでいるバーがあれば選択を外す。なければその週にイベントを追加 */
  const onTrack = (e: MouseEvent, vehicleId: ID | null) => {
    if ((e.target as Element).closest('[data-bar]')) return;
    if (getUI().selected) return setUI({ selected: null });
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const i = Math.max(0, Math.floor((e.clientX - r.left) / g.weekW));
    openSheet('plan', { vehicleId, start: addDays(g.from, i * 7) });
  };

  return (
    <div className="gantt plan" ref={box}>
      {size.w > 0 && (
        <div className="gscroll" ref={scroller} data-testid="plan-scroll">
          <div className="gcontent" style={{ width: `${width}px` }}>
            <div className="ghead" style={{ height: `${g.headH}px`, width: `${width}px` }}>
              <div className="corner pcorner" style={{ width: `${g.nameW}px` }}>
                <span>{vehicle === 'all' ? '車種' : 'イベント'}</span>
                <span className="lname">負荷</span>
              </div>
              <div className="gdays" style={{ width: `${g.weeks * g.weekW}px`, height: `${g.headH}px` }}>
                {months.map((m) => (
                  <div key={m.left} className="gmonth" style={{ left: `${m.left}px`, width: `${m.width}px` }}>
                    {/* 端の数日だけの月（範囲の始まり・終わり）は、名前が隣と重なるので出さない */}
                    {m.width >= rootPx() * (zoom === 'month' ? 2.25 : 5.5) && <span style={{ left: `${g.nameW}px` }}>{m.label}</span>}
                  </div>
                ))}
                {Array.from({ length: g.weeks }, (_, i) => (
                  <div key={i} className={`gday pweek${i === thisWeek ? ' now' : ''}`} style={{ left: `${i * g.weekW}px`, width: `${g.weekW}px`, bottom: 'auto', top: `${HEAD.month}rem` }}>
                    {zoom === 'week' ? Number(addDays(g.from, i * 7).slice(8, 10)) : ''}
                  </div>
                ))}
                {loads.map((n, i) => (
                  <div key={i} className={`gload l${loadLevel(n)}`} style={{ left: `${i * g.weekW}px`, width: `${g.weekW}px` }} title={n ? `負荷 ${n}（${LOAD_LEVEL_LABEL[loadLevel(n)]}）` : ''} data-week={addDays(g.from, i * 7)}>
                    {n || ''}
                  </div>
                ))}
              </div>
            </div>
            <div className="gbody" ref={body} style={{ position: 'relative' }}>
              <div className="gbg" style={{ left: `${g.nameW}px`, width: `${g.weeks * g.weekW}px` }}>
                {loads.map((n, i) => (loadLevel(n) >= 2 ? <div key={i} className={`lw l${loadLevel(n)}`} style={{ left: `${i * g.weekW}px`, width: `${g.weekW}px` }} /> : null))}
                <div className="ggrid" style={{ backgroundImage: 'linear-gradient(to right, var(--grid) 1px, transparent 1px)', backgroundSize: `${g.weekW}px 100%` }} />
                {months.map((m) => (
                  <div key={m.left} className="gmline" style={{ left: `${m.left}px` }} />
                ))}
                <div className="now" style={{ left: `${x(day) + g.dayW / 2 - 1}px` }} />
              </div>
              {rows.map((r) => (
                <PlanLine key={r.key} r={r} g={g} selected={selected} onTrack={onTrack} />
              ))}
              {vehicle !== 'all' && (
                <div className="gline padd" style={{ height: `${g.rowH}px` }}>
                  <div className="gname" style={{ width: `${g.nameW}px`, height: `${g.rowH}px` }}>
                    <Icon name="plus" size={14} />
                    <span className="micro">タップで追加</span>
                  </div>
                  <div className="gtrack" style={{ width: `${g.weeks * g.weekW}px`, height: `${g.rowH}px` }} onClick={(e: MouseEvent) => onTrack(e, vehicle)} />
                </div>
              )}
              {vehicles.length === 0 && !plans.length && (
                <div className="empty" style={{ position: 'sticky', left: 0, width: `${size.w}px` }}>
                  車種を追加すると、車種ごとの大日程を作れます
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PlanLine = memo(function PlanLine({ r, g, selected, onTrack }: { r: PlanRow; g: Geom; selected: string | null; onTrack: (e: MouseEvent, vehicleId: ID | null) => void }) {
  const h = `${g.rowH}px`;
  const trackW = `${g.weeks * g.weekW}px`;
  if (r.kind === 'lane') {
    const first = r.lane === 0;
    const last = r.lane === r.lanes - 1;
    return (
      <div className={`gline plane${last ? ' vend' : ''}`} style={{ height: h }} data-vehicle={r.vehicleId ?? '-'}>
        <div className="gname v" style={{ width: `${g.nameW}px`, height: h }} onClick={() => r.vehicleId && commit((d) => setSettings(d, { vehicle: r.vehicleId! }), { undoable: false })}>
          {first && (
            <>
              <i className="vdot" style={{ background: r.vehicle?.color ?? 'var(--gray)' }} />
              <span className="ellipsis">{r.vehicle?.name ?? '共通'}</span>
            </>
          )}
        </div>
        <div className="gtrack" style={{ width: trackW, height: h }} onClick={(e: MouseEvent) => onTrack(e, r.vehicleId)}>
          {r.events.map((p) => (
            <Bar key={p.id} p={p} g={g} selected={selected === p.id} label={p.title} />
          ))}
        </div>
      </div>
    );
  }
  const p = r.event;
  const k = PLAN_KINDS[p.kind];
  return (
    <div className="gline" style={{ height: h }} aria-selected={selected === p.id ? 'true' : 'false'}>
      <div className="gname" style={{ width: `${g.nameW}px`, height: h }} onClick={() => (selected === p.id ? openSheet('plan', { id: p.id }) : setUI({ selected: p.id }))}>
        <i className="vdot" style={{ background: k.color }} />
        <span className="ellipsis grow">{p.title}</span>
        <span className="num micro">{weeksOf(p)}週</span>
      </div>
      <div className="gtrack" style={{ width: trackW, height: h }} onClick={(e: MouseEvent) => onTrack(e, p.vehicleId)}>
        <Bar p={p} g={g} selected={selected === p.id} label={`${k.label}・負荷${LOAD_LABEL[p.load]}`} />
      </div>
    </div>
  );
});

function Bar({ p, g, selected, label }: { p: PlanEvent; g: Geom; selected: boolean; label: string }) {
  const left = diffDays(g.from, p.start) * g.dayW;
  const w = (diffDays(p.start, p.end) + 1) * g.dayW;
  return (
    <div
      className={`pbar ld${p.load}`}
      data-bar={p.id}
      data-start={p.start}
      data-end={p.end}
      data-ww="1"
      data-no-drag
      aria-selected={selected ? 'true' : 'false'}
      aria-label={`${p.title} ${shortDate(p.start)}〜${shortDate(p.end)} ${weeksOf(p)}週 負荷${LOAD_LABEL[p.load]}`}
      style={{ left: `${left + 1}px`, width: `${Math.max(4, w - 2)}px`, ['--bar' as string]: PLAN_KINDS[p.kind].color }}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        if (selected) openSheet('plan', { id: p.id });
        else setUI({ selected: p.id });
      }}
    >
      <span className="plabel">{label}</span>
      <div className="h l" data-handle="l" />
      <div className="h r" data-handle="r" />
    </div>
  );
}

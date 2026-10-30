/**
 * ガントチャート。
 *
 * 同期の方法: 名前の列とバーを「同じ行の要素」として1つのスクロール領域に描く。
 *   - 縦スクロール・行の高さ・並び順・選択・ドラッグ中の移動は、構造上つねに一致する（別々に動かせない）
 *   - 名前の列は position: sticky で左に固定し、横スクロールは日付の部分だけが動く
 *   - 日付の見出しは sticky で上に固定
 *
 * バーの操作: 本体の移動 = 期間の平行移動、両端 = 開始日・期限の変更。
 *   操作中はそのバーの transform/幅だけを直接動かし（React の再描画をしない）、指を離した時点で日付を確定して保存する。
 *   日付の確定 → 並べ替え（期限順なら）→ FLIP の行アニメーション、の順に分けて行う。
 */
import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { reorder, setDone, setTaskRange } from '../../model/actions';
import { addDays, daysInMonth, diffDays, fromDay, isWeekend, monthOf, monthStart, resizeEnd, resizeStart, shiftRange, shortDate, toDay, today, workdays, workRuns } from '../../model/dates';
import type { Row } from '../../model/rows';
import type { GanttZoom, Task } from '../../model/types';
import { LEVEL, priorityOf } from '../../model/priority';
import { commit, openSheet, setUI, toast, useData, useUI } from '../../store/store';
import { PrioBadge, Reveal } from '../components/bits';
import { toggleGroup, useFlip } from '../components/TaskList';
import { Icon } from '../icons';
import { attachSortable } from '../drag/sortable';
import { attachBarDrag } from './barDrag';

/** 1日の幅（rem） */
export const DAY_REM: Record<GanttZoom, number> = { day: 1.75, week: 0.75, month: 0.3 };
const HEAD_REM = 2.625;

const rootPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 15;

export interface GanttGeom {
  from: string;
  days: number;
  dayW: number;
  nameW: number;
  rowH: number;
}

/**
 * 表示する日付の範囲（今日の8週間前から、最後の期限の3週間後まで。最低90日先まで）。
 * 始まりと終わりは月の境目にそろえる（端に1日だけの月ができて、月の見出しが重ならないように）
 */
export function ganttRange(rows: Row[], day: string): { from: string; days: number } {
  let a = toDay(day) - 56;
  let b = toDay(day) + 90;
  for (const r of rows) {
    if (r.kind !== 'task') continue;
    const s = r.task.start ?? r.task.due;
    const e = r.task.due ?? r.task.start;
    if (s) a = Math.min(a, toDay(s) - 7);
    if (e) b = Math.max(b, toDay(e) + 21);
  }
  const s = monthOf(fromDay(a));
  const from = monthStart(s.y, s.m);
  const e = monthOf(fromDay(b));
  const last = toDay(monthStart(e.y, e.m)) + daysInMonth(e.y, e.m) - 1;
  return { from, days: last - toDay(from) + 1 };
}

function useSize(el: { current: HTMLElement | null }) {
  const [s, setS] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const x = el.current;
    if (!x) return;
    const ro = new ResizeObserver(() => setS({ w: x.clientWidth, h: x.clientHeight }));
    ro.observe(x);
    setS({ w: x.clientWidth, h: x.clientHeight });
    return () => ro.disconnect();
  }, []);
  return s;
}

export function Gantt({ rows, zoom, scrollApi }: { rows: Row[]; zoom: GanttZoom; scrollApi?: { current: ((to: 'today' | 'prev' | 'next') => void) | null } }) {
  const day = today();
  const box = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const size = useSize(box);
  const fontStep = useData((d) => d.settings.fontStep);
  const selected = useUI((u) => u.selected);
  const vehicles = useData((d) => d.vehicles);
  const range = useMemo(() => ganttRange(rows, day), [rows, day]);

  // 1画面に20行入る高さ（文字が大きいときは行の最低の高さを優先）
  const geom: GanttGeom = useMemo(() => {
    const px = rootPx();
    const head = HEAD_REM * px;
    const minRow = 1.4 * px;
    const rowH = Math.max(minRow, Math.floor((size.h - head) / 20));
    const nameW = Math.round((size.w >= 720 ? 15 : size.w >= 480 ? 11 : 8.5) * px);
    return { from: range.from, days: range.days, dayW: Math.round(DAY_REM[zoom] * px * 100) / 100, nameW, rowH };
    // fontStep: 文字サイズを変えたら計り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, range.from, range.days, zoom, fontStep]);

  const width = geom.nameW + geom.days * geom.dayW;
  const x = (d: string) => diffDays(geom.from, d) * geom.dayW;

  // 最初は今日が左から1/4のあたりに来るように。ズームを変えたときは中央の日付を保つ
  const centerDay = useRef<number | null>(null);
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc || !size.w) return;
    const visible = size.w - geom.nameW;
    const c = centerDay.current;
    const target = c != null ? (c - toDay(geom.from)) * geom.dayW - visible / 2 : x(day) - visible / 4;
    sc.scrollLeft = Math.max(0, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geom.dayW, size.w > 0]);
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const onScroll = () => {
      centerDay.current = toDay(geom.from) + (sc.scrollLeft + (sc.clientWidth - geom.nameW) / 2) / geom.dayW;
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => sc.removeEventListener('scroll', onScroll);
  }, [geom.from, geom.dayW, geom.nameW]);

  if (scrollApi)
    scrollApi.current = (to) => {
      const sc = scroller.current;
      if (!sc) return;
      const visible = sc.clientWidth - geom.nameW;
      const left = to === 'today' ? x(day) - visible / 4 : sc.scrollLeft + (to === 'next' ? 1 : -1) * Math.max(visible * 0.8, geom.dayW * 7);
      sc.scrollTo({ left: Math.max(0, left), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    };

  // 行の並べ替え（名前の列の長押し）。行全体が一緒に動く
  useEffect(() => {
    if (!body.current || !scroller.current) return;
    return attachSortable(body.current, {
      scroller: scroller.current,
      onState: (k) => k && setUI({ selected: null }),
      onDrop: (_k, group, keys) => {
        let switched = false;
        commit((d) => {
          const r = reorder(d, group, keys);
          switched = r.switched;
          return r.data;
        });
        if (switched) toast('手動の並びに切り替えました');
      },
    });
  }, [size.w > 0]);

  // バーの移動・伸縮
  const geomRef = useRef(geom);
  geomRef.current = geom;
  useEffect(() => {
    if (!body.current || !scroller.current) return;
    return attachBarDrag(body.current, scroller.current, () => geomRef.current, (id, start, end) => {
      commit((d) => setTaskRange(d, id, start, end), { undoable: true });
    });
  }, [size.w > 0]);

  useFlip(body);
  const headH = HEAD_REM * rootPx();

  /** 月の見出し: 月ごとの区間。文字は区間の中で左に貼りつく（sticky）ので、横に動かしても今の月が見え、隣の月と重ならない */
  const months = useMemo(() => {
    const out: { left: number; width: number; label: string }[] = [];
    const end = toDay(geom.from) + geom.days;
    let d = geom.from;
    while (toDay(d) < end) {
      const { y, m } = monthOf(d);
      const next = Math.min(end, toDay(d) + daysInMonth(y, m) - (Number(d.slice(8, 10)) - 1));
      out.push({ left: x(d), width: (next - toDay(d)) * geom.dayW, label: `${y}年${m}月` });
      d = fromDay(next);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geom.from, geom.days, geom.dayW]);

  const weekends = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < geom.days; i++) if (isWeekend(addDays(geom.from, i))) out.push(i);
    return out;
  }, [geom.from, geom.days]);

  const vColor = useMemo(() => new Map(vehicles.map((v) => [v.id, v.color])), [vehicles]);

  // エクセルのような格子: 日（週の単位では週）ごとの縦線。月の境目は少し濃い線
  const firstMon = (8 - new Date(`${geom.from}T00:00:00Z`).getUTCDay()) % 7;
  const grid =
    zoom === 'month'
      ? undefined
      : {
          backgroundImage: 'linear-gradient(to right, var(--grid) 1px, transparent 1px)',
          backgroundSize: `${zoom === 'week' ? geom.dayW * 7 : geom.dayW}px 100%`,
          backgroundPosition: `${zoom === 'week' ? firstMon * geom.dayW : 0}px 0`,
        };

  return (
    <>
    <div className="gantt" ref={box} style={{ ['--row' as string]: `${geom.rowH}px` }}>
      {size.w > 0 && (
        <div className="gscroll" ref={scroller} data-testid="gantt-scroll">
          <div className="gcontent" style={{ width: `${width}px` }}>
            <div className="ghead" style={{ height: `${headH}px`, width: `${width}px` }}>
              <div className="corner" style={{ width: `${geom.nameW}px` }}>
                項目
              </div>
              <div className="gdays" style={{ width: `${geom.days * geom.dayW}px`, height: `${headH}px` }}>
                {months.map((m) => (
                  <div key={m.left} className="gmonth" style={{ left: `${m.left}px`, width: `${m.width}px` }}>
                    <span style={{ left: `${geom.nameW}px` }}>{m.label}</span>
                  </div>
                ))}
                {zoom !== 'month' &&
                  Array.from({ length: geom.days }, (_, i) => {
                    const d = addDays(geom.from, i);
                    if (zoom === 'week' && new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) return null;
                    const we = isWeekend(d);
                    return (
                      <div key={i} className={`gday${we && zoom === 'day' ? ' we' : ''}${d === day ? ' today' : ''}`} style={{ left: `${i * geom.dayW}px`, width: `${zoom === 'week' ? geom.dayW * 7 : geom.dayW}px`, justifyContent: zoom === 'week' ? 'flex-start' : 'center' }}>
                        {Number(d.slice(8, 10))}
                      </div>
                    );
                  })}
              </div>
            </div>
            <div className="gbody" ref={body} style={{ position: 'relative' }}>
              <div className="gbg" style={{ left: `${geom.nameW}px`, width: `${geom.days * geom.dayW}px` }}>
                {zoom !== 'month' && weekends.map((i) => <div key={i} className="we" style={{ left: `${i * geom.dayW}px`, width: `${geom.dayW}px` }} />)}
                <div className="ggrid" style={grid} />
                {months.map((m) => (
                  <div key={m.left} className="gmline" style={{ left: `${m.left}px` }} />
                ))}
                <div className="now" style={{ left: `${x(day) + geom.dayW / 2 - 1}px` }} />
              </div>
              {rows.map((r) => (
                <GanttRow key={r.key} r={r} geom={geom} selected={r.kind === 'task' ? selected === r.task.id : selected === r.key} color={r.kind === 'task' ? vColor.get(r.task.vehicleId ?? '') ?? 'var(--green)' : r.kind === 'group' ? r.vehicle?.color ?? 'var(--navy)' : 'var(--navy)'} day={day} />
              ))}
              {rows.length === 0 && (
                <div className="empty" style={{ position: 'sticky', left: 0, width: `${size.w}px` }}>
                  タスクを追加すると、ここに工程が並びます
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

const GanttRow = memo(function GanttRow({ r, geom, selected, color, day }: { r: Row; geom: GanttGeom; selected: boolean; color: string; day: string }) {
  const h = `${geom.rowH}px`;
  const trackW = `${geom.days * geom.dayW}px`;
  if (r.kind === 'vehicle' || r.kind === 'pinned') {
    return (
      <div className="gline" data-flip={r.key} data-level={0} style={{ height: h }}>
        <div className="gname v" style={{ width: `${geom.nameW}px`, height: h }}>
          <span style={{ width: '0.25rem', height: '0.875rem', borderRadius: 2, background: r.kind === 'pinned' ? 'var(--navy)' : r.vehicle?.color ?? 'var(--gray)', flex: 'none' }} />
          <Reveal text={r.kind === 'pinned' ? '固定したグループ' : r.vehicle?.name ?? '車種なし'} />
        </div>
        <div className="gtrack" style={{ width: trackW, height: h, background: 'rgba(238,240,236,0.5)' }} />
      </div>
    );
  }
  if (r.kind === 'prio') {
    const l = r.level ? LEVEL[r.level] : null;
    return (
      <div className={`gline prio p${r.level}`} data-flip={r.key} data-level={0} style={{ height: h }}>
        <div className="gname v" style={{ width: `${geom.nameW}px`, height: h }}>
          <span className="ptag">{l ? l.label : '完了'}</span>
          <span className="num micro" style={{ marginLeft: 'auto', flex: 'none' }}>
            {r.stats.total}件
          </span>
        </div>
        <div className="gtrack" style={{ width: trackW, height: h }} />
      </div>
    );
  }
  if (r.kind === 'group') {
    const s = r.stats;
    const left = s.start ? diffDays(geom.from, s.start) * geom.dayW : 0;
    const w = s.start && s.end ? (diffDays(s.start, s.end) + 1) * geom.dayW : 0;
    return (
      <div
        className="gline"
        data-flip={r.key}
        data-level={r.depth + 1}
        data-group-anchor={r.group.id}
        style={{ height: h }}
        aria-selected={selected ? 'true' : 'false'}
        aria-expanded={r.open ? 'true' : 'false'}
        onClick={(e: MouseEvent) => r.open === !r.group.collapsed && toggleGroup(r.group.id, r.group.collapsed, e.currentTarget as Element)}
      >
        <div className={`gname g${r.depth}`} style={{ width: `${geom.nameW}px`, height: h }}>
          <span className="gfold" aria-hidden="true">
            <Icon name="down" size={12} />
          </span>
          <Reveal text={r.group.name} />
          <span className="num micro" style={{ marginLeft: 'auto', flex: 'none' }}>
            {s.done}/{s.total}
          </span>
        </div>
        <div className="gtrack" style={{ width: trackW, height: h }}>
          {w > 0 && <div className="gsum" style={{ left: `${left}px`, width: `${w}px`, ['--bar' as string]: color }} />}
        </div>
      </div>
    );
  }
  const t = r.task;
  return (
    <div
      className="gline"
      data-flip={t.id}
      data-sort-key={t.id}
      data-sort-group={r.container}
      data-sort-off={r.container.startsWith('p:') ? 'true' : undefined}
      style={{ height: h }}
      aria-selected={selected ? 'true' : 'false'}
      onClick={() => (selected ? openSheet('task', { id: t.id }) : setUI({ selected: t.id }))}
    >
      <div className={`gname t${r.depth}${t.done ? ' done' : ''}`} style={{ width: `${geom.nameW}px`, height: h }}>
        <button
          type="button"
          className="ck"
          role="checkbox"
          aria-checked={t.done ? 'true' : 'false'}
          aria-label={`${t.title}を完了`}
          data-no-drag
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            commit((d) => setDone(d, t.id, !t.done), { toast: !t.done ? `「${t.title}」を完了` : undefined });
          }}
        />
        <PrioBadge info={priorityOf(t, day)} compact />
        <Reveal text={t.title || '無題'} />
      </div>
      <div className="gtrack" style={{ width: trackW, height: h }}>
        <Bar t={t} geom={geom} color={color} day={day} />
      </div>
    </div>
  );
});

/** タスクのバー（土日作業なしは週末で区切って描く。進捗は作業日の割合で塗る） */
function Bar({ t, geom, color, day }: { t: Task; geom: GanttGeom; color: string; day: string }) {
  const s = t.start ?? t.due;
  const e = t.due ?? t.start;
  if (!s || !e) return null;
  const left = diffDays(geom.from, s) * geom.dayW;
  const w = (diffDays(s, e) + 1) * geom.dayW;
  const runs = workRuns(s, e, t.weekendWork);
  const total = workdays(s, e, t.weekendWork) || 1;
  let fillLeft = Math.round((t.done ? 1 : t.progress / 100) * total);
  const over = !t.done && toDay(e) < toDay(day);
  return (
    <div
      className={`gbar${over ? ' over' : ''}${t.done ? ' done' : ''}`}
      data-bar={t.id}
      data-start={s}
      data-end={e}
      data-ww={t.weekendWork ? '1' : '0'}
      data-no-drag
      style={{ left: `${left}px`, width: `${w}px`, ['--bar' as string]: color }}
      aria-label={`${t.title} ${shortDate(s)}〜${shortDate(e)}`}
    >
      {runs.map((run, i) => {
        const rl = diffDays(s, run.start) * geom.dayW;
        const rw = (diffDays(run.start, run.end) + 1) * geom.dayW;
        const n = diffDays(run.start, run.end) + 1;
        const f = Math.min(n, Math.max(0, fillLeft));
        fillLeft -= n;
        const next = runs[i + 1];
        return (
          <React.Fragment key={run.start}>
            <div className="seg-run" style={{ left: `${rl + 1}px`, width: `${Math.max(2, rw - 2)}px` }} />
            {f > 0 && <div className="fill" style={{ left: `${rl + 1}px`, width: `${Math.max(2, f * geom.dayW - 2)}px` }} />}
            {next && <div className="link" style={{ left: `${rl + rw - 1}px`, width: `${(diffDays(run.end, next.start) - 1) * geom.dayW + 2}px` }} />}
          </React.Fragment>
        );
      })}
      <div className="h l" data-handle="l" />
      <div className="h r" data-handle="r" />
    </div>
  );
}

/** ドラッグ中のバーの日付（バーのドラッグ処理から使う） */
export function previewRange(kind: 'move' | 'l' | 'r', start: string, end: string, deltaDays: number, ww: boolean): { start: string; end: string } {
  if (kind === 'move') return shiftRange(start, end, deltaDays, ww);
  if (kind === 'l') return { start: resizeStart(addDays(start, deltaDays), end, ww), end };
  return { start, end: resizeEnd(start, addDays(end, deltaDays), ww) };
}

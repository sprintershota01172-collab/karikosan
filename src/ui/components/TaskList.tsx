/**
 * タスク一覧（グループ・子ツリー・タスク）。長押しで並べ替え、タップで選択、選択中にもう一度タップで編集。
 * 行の並び替え（期限順の自動整列など）は FLIP で滑らかに動かす。ドラッグ確定のときは動かさない。
 */
import React, { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { reorder, setDone, updateGroup } from '../../model/actions';
import { shortDate, toDay, today } from '../../model/dates';
import { isOverdue, type Row } from '../../model/rows';
import type { Task } from '../../model/types';
import { commit, openSheet, setUI, toast, useUI } from '../../store/store';
import { attachSortable } from '../drag/sortable';
import { Icon } from '../icons';
import { Check, PRIORITY, Reveal, Ring } from './bits';

export function dueLabel(t: Task, day = today()) {
  if (!t.due) return { text: '', cls: '' };
  const d = toDay(t.due) - toDay(day);
  if (!t.done && d < 0) return { text: shortDate(t.due, false), cls: 'over' };
  if (d === 0) return { text: '今日', cls: 'today' };
  if (d === 1) return { text: '明日', cls: '' };
  return { text: shortDate(t.due, false), cls: '' };
}

export function completeTask(t: Task, done: boolean) {
  commit((d) => setDone(d, t.id, done), { toast: done ? `「${t.title || '無題'}」を完了` : undefined, undoable: true });
}

export const TaskRow = memo(function TaskRow({ t, depth, container, selected, color }: { t: Task; depth: number; container: string; selected: boolean; color: string }) {
  const due = dueLabel(t);
  const [pop, setPop] = useState(false);
  const pr = PRIORITY[t.priority];
  return (
    <div
      className={`trow${t.done ? ' done' : ''}${pop ? ' just-done' : ''}`}
      data-depth={depth}
      data-sort-key={t.id}
      data-sort-group={container}
      data-flip={t.id}
      aria-selected={selected ? 'true' : 'false'}
      onClick={() => (selected ? openSheet('task', { id: t.id }) : setUI({ selected: t.id }))}
    >
      <Check
        on={t.done}
        label={`${t.title}を完了`}
        onChange={(v) => {
          setPop(v);
          setTimeout(() => setPop(false), 340);
          completeTask(t, v);
        }}
      />
      <div className="title">
        {t.priority > 0 && <span className="prio" style={{ background: pr.color }} aria-label={`優先度 ${pr.label}`} />}
        <Reveal text={t.title || '無題'} />
      </div>
      <div className="meta">
        {t.assignee && <span className="who ellipsis">{t.assignee}</span>}
        {t.progress > 0 && !t.done && (
          <span className="prog" aria-label={`進捗 ${t.progress}%`}>
            <i style={{ width: `${t.progress}%`, background: color }} />
          </span>
        )}
        <span className={`due num ${due.cls}`}>{due.text}</span>
      </div>
      {selected ? (
        <button type="button" className="edit" aria-label="編集" data-no-drag onClick={(e: MouseEvent) => (e.stopPropagation(), openSheet('task', { id: t.id }))}>
          <Icon name="right" size={18} />
        </button>
      ) : (
        <span style={{ width: '2rem', flex: 'none' }} />
      )}
    </div>
  );
});

function GroupHead({ r, selected }: { r: Extract<Row, { kind: 'group' }>; selected: boolean }) {
  const g = r.group;
  const child = r.depth === 1;
  return (
    <div className={`grow-head${child ? ' child' : ''}`} data-flip={r.key} data-group-anchor={g.id} aria-selected={selected ? 'true' : 'false'} style={selected ? { background: 'var(--green-soft)' } : undefined} onClick={() => setUI({ selected: r.key })}>
      <button type="button" className="fold" aria-expanded={g.collapsed ? 'false' : 'true'} aria-label={g.collapsed ? '開く' : 'たたむ'} onClick={(e: MouseEvent) => (e.stopPropagation(), commit((d) => updateGroup(d, g.id, { collapsed: !g.collapsed }), { undoable: false }))}>
        <Icon name="down" size={16} />
      </button>
      {g.pinned && <Icon name="pin" size={14} className="pinned" />}
      <span className="name ellipsis grow">{g.name}</span>
      <span className="stat num">
        {r.stats.done}/{r.stats.total}
      </span>
      <Ring value={r.stats.total ? Math.round((r.stats.done / r.stats.total) * 100) : 0} size={child ? 16 : 18} color={r.vehicle?.color} />
      <button type="button" className="iconbtn" style={{ width: '2rem', height: '2rem' }} aria-label={`${g.name}のメニュー`} onClick={(e: MouseEvent) => (e.stopPropagation(), openSheet('group', { id: g.id }))}>
        <Icon name="more" size={18} />
      </button>
    </div>
  );
}

export function TaskList({ rows, empty }: { rows: Row[]; empty?: ReactElement | null }) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const selected = useUI((u) => u.selected);

  useEffect(() => {
    if (!root.current || !scroller.current) return;
    return attachSortable(root.current, {
      scroller: scroller.current,
      onState: (k) => k && setUI({ selected: null }),
      onDrop: (_key, group, keys) => {
        let switched = false;
        commit((d) => {
          const r = reorder(d, group, keys);
          switched = r.switched;
          return r.data;
        });
        if (switched) toast('手動の並びに切り替えました（期限順は並び順のボタンで戻せます）');
      },
    });
  }, []);

  useFlip(root);

  // 一覧の外（余白）をタップしたら選択を外す
  return (
    <div className="scroll" ref={scroller} onClick={(e: MouseEvent) => e.target === e.currentTarget && setUI({ selected: null })}>
      <div className="list" ref={root}>
        {rows.length === 0 && empty}
        {rows.map((r) => {
          if (r.kind === 'vehicle' || r.kind === 'pinned')
            return (
              <div key={r.key} className="vrow" data-flip={r.key}>
                <span className="bar" style={{ background: r.kind === 'pinned' ? 'var(--navy)' : r.vehicle?.color ?? 'var(--gray)' }} />
                <span className="ellipsis grow">{r.kind === 'pinned' ? '固定したグループ' : r.vehicle?.name ?? '車種なし'}</span>
                <span className="num micro">
                  {r.stats.done}/{r.stats.total}
                </span>
              </div>
            );
          if (r.kind === 'group') return <GroupHead key={r.key} r={r} selected={selected === r.key} />;
          return <TaskRow key={r.key} t={r.task} depth={r.depth} container={r.container} selected={selected === r.task.id} color={r.vehicle?.color ?? 'var(--green)'} />;
        })}
        <div style={{ height: '3rem' }} />
      </div>
    </div>
  );
}

/**
 * 行の位置が変わったら、前の位置から滑らかに動かす（FLIP）。
 * ドラッグで確定した直後（drag-settle）と、ドラッグ中は動かさない。
 */
export function useFlip(root: { current: HTMLElement | null }) {
  const prev = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const now = new Map<string, number>();
    const items = Array.from(el.querySelectorAll<HTMLElement>('[data-flip]'));
    for (const x of items) now.set(x.dataset.flip!, x.offsetTop);
    const skip = el.classList.contains('drag-settle') || el.classList.contains('dragging-on') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!skip) {
      const moved: HTMLElement[] = [];
      for (const x of items) {
        const before = prev.current.get(x.dataset.flip!);
        const after = now.get(x.dataset.flip!)!;
        if (before == null || before === after) continue;
        x.style.transition = 'none';
        x.style.transform = `translate3d(0, ${before - after}px, 0)`;
        moved.push(x);
      }
      if (moved.length) {
        void el.offsetHeight; // 位置を確定させてから戻す
        for (const x of moved) {
          x.style.transition = 'transform var(--t-move) var(--ease)';
          x.style.transform = '';
          const done = () => {
            x.style.transition = '';
            x.removeEventListener('transitionend', done);
          };
          x.addEventListener('transitionend', done);
        }
      }
    }
    prev.current = now;
  });
}

export const isOver = isOverdue;

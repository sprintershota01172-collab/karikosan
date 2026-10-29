import React, { useMemo, useState } from 'react';
import { addTask, setSettings, setSortMode } from '../../model/actions';
import type { Row } from '../../model/rows';
import { commit, getUI, openSheet, setUI, useData, useUI } from '../../store/store';
import { Seg } from '../components/bits';
import { TaskList } from '../components/TaskList';
import { VehicleChips } from '../components/VehicleChips';
import { Icon } from '../icons';
import { useRows } from '../view';
import { Checklists } from './Checklists';

const STATUS_LABEL = { all: 'すべて', open: '未完了', done: '完了', overdue: '期限超過', today: '今日', week: '今週' } as const;

/** クイック追加の行き先: 選んでいるグループ・タスクのグループ、なければ表示中の車種の直下 */
export function addTarget(rows: Row[], selected: string | null, vehicle: string | 'all') {
  const r = selected ? rows.find((x) => x.key === selected) : null;
  if (r?.kind === 'group') return { groupId: r.group.id, vehicleId: r.group.vehicleId, label: r.group.name };
  if (r?.kind === 'task') return { groupId: r.task.groupId, vehicleId: r.task.vehicleId, label: '' };
  return { groupId: null, vehicleId: vehicle === 'all' ? null : vehicle, label: '' };
}

export function QuickAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string) => void }) {
  const [v, setV] = useState('');
  const submit = () => {
    const t = v.trim();
    if (!t) return;
    onAdd(t);
    setV('');
  };
  return (
    <form
      className="quick"
      onSubmit={(e: Event) => {
        e.preventDefault();
        submit();
      }}
    >
      <input className="inp" value={v} placeholder={placeholder} enterKeyHint="done" aria-label="タスクを追加" onInput={(e: Event) => setV((e.target as HTMLInputElement).value)} />
      <button type="submit" className="btn primary" aria-label="追加" disabled={!v.trim()}>
        <Icon name="plus" />
      </button>
    </form>
  );
}

export function Tasks() {
  const view = useUI((u) => u.tasksView);
  return (
    <div className="screen">
      <Seg value={view} onChange={(v) => setUI({ tasksView: v })} options={[{ value: 'tasks', label: 'タスク' }, { value: 'checklists', label: 'チェックリスト' }]} label="表示" />
      {view === 'tasks' ? <TaskPane /> : <Checklists />}
    </div>
  );
}

function TaskPane() {
  const rows = useRows();
  const sortMode = useData((d) => d.settings.sortMode);
  const showDone = useData((d) => d.settings.showDone);
  const vehicle = useData((d) => d.settings.vehicle);
  const nTasks = useData((d) => d.tasks.length);
  const status = useUI((u) => u.status);
  const assignee = useUI((u) => u.assignee);
  const query = useUI((u) => u.query);
  const selected = useUI((u) => u.selected);
  const target = useMemo(() => addTarget(rows, selected, vehicle), [rows, selected, vehicle]);
  const filtered = status !== 'all' || !!assignee || !!query;
  return (
    <>
      <VehicleChips />
      <div className="toolbar">
        <button type="button" className="chip" aria-pressed="false" onClick={() => commit((d) => setSortMode(d, sortMode === 'manual' ? 'due' : 'manual'), { undoable: false })} aria-label={`並び順: ${sortMode === 'manual' ? '手動' : '期限順'}`}>
          <Icon name="sort" size={14} />
          <span>{sortMode === 'manual' ? '手動' : '期限順'}</span>
        </button>
        <button type="button" className="chip" aria-pressed={filtered ? 'true' : 'false'} onClick={() => openSheet('filter')}>
          <Icon name="filter" size={14} />
          <span>{filtered ? [status !== 'all' ? STATUS_LABEL[status] : '', assignee ?? '', query ? `「${query}」` : ''].filter(Boolean).join('・') : '絞り込み'}</span>
        </button>
        <span className="grow" />
        <button type="button" className="iconbtn" aria-label={showDone ? '完了を隠す' : '完了を表示'} aria-pressed={showDone ? 'true' : 'false'} onClick={() => commit((d) => setSettings(d, { showDone: !showDone }), { undoable: false })}>
          <Icon name={showDone ? 'check' : 'hide'} />
        </button>
        <button type="button" className="iconbtn" aria-label="グループへ移動" onClick={() => openSheet('jump')}>
          <Icon name="tree" />
        </button>
        <button type="button" className="iconbtn" aria-label="グループを追加" onClick={() => openSheet('group', { vehicleId: vehicle === 'all' ? null : vehicle })}>
          <Icon name="folder" />
        </button>
      </div>
      <TaskList
        rows={rows}
        empty={
          <div className="empty">
            {nTasks === 0 ? (
              <>
                <div>下の入力欄からタスクを追加できます</div>
                <div className="micro">車種・グループは右上のボタンで追加</div>
              </>
            ) : (
              <div>該当するタスクはありません</div>
            )}
          </div>
        }
      />
      <QuickAdd
        placeholder={target.label ? `${target.label}にタスクを追加` : 'タスクを追加'}
        onAdd={(title) => {
          const t = addTarget(rows, getUI().selected, vehicle);
          let id = '';
          commit((d) => {
            const r = addTask(d, { title, groupId: t.groupId, vehicleId: t.vehicleId });
            id = r.task.id;
            return r.data;
          });
          // 追加した行を見えるところへ
          requestAnimationFrame(() => document.querySelector(`[data-sort-key="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
        }}
      />
    </>
  );
}

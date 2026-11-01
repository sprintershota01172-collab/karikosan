/** 入力画面（シート）。変更はその場で保存し、文字は入力欄を離れたときに確定する */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { attachSortable } from './drag/sortable';
import {
  addEvent,
  addGroup,
  addTask,
  addVehicle,
  deleteChecklist,
  deleteCheckItem,
  deleteEvent,
  deleteGroup,
  deleteTasks,
  deleteVehicle,
  moveCheckItem,
  moveGroup,
  renameChecklist,
  setAllVehiclesOpen,
  setGroupOpen,
  setGroupOrder,
  setSettings,
  setSortMode,
  setVehicleOrder,
  toggleVehicleOpen,
  updateEvent,
  updateGroup,
  updateTask,
  updateVehicle,
} from '../model/actions';
import { addDays as addDaysD, isDateStr, shortDate, startOfWeek as startOfWeekD, today, workdays } from '../model/dates';
import { addPlan, deletePlan, LOAD_LABEL, PLAN_KIND_ORDER, PLAN_KINDS, snapWeeks, updatePlan, weeksOf } from '../model/plan';
import { REPEAT_LABEL } from '../model/recur';
import { assignees, type StatusFilter } from '../model/rows';
import { VEHICLE_COLORS } from '../model/schema';
import { autoGroupColor, BAR_COLOR_LABEL, GROUP_COLORS, groupColors, PRIORITY_COLORS } from '../model/colors';
import { search } from '../model/search';
import type { CalEvent, Group, PlanEvent, Priority } from '../model/types';
import { closeSheet, commit, getData, openSheet, setTab, setUI, toast, useData, useUI } from '../store/store';
import { AutoArea, Field, PrioBadge, Reveal, Seg, TextInput, Toggle } from './components/bits';
import { revealIn } from './reveal';
import { LEVEL, priorityOf, PRIORITY_CHOICES } from '../model/priority';
import { Sheet } from './components/Sheet';
import { Icon } from './icons';
import { ReportSheet, ReportsSheet } from './screens/Report';

export interface SheetProps {
  props: Record<string, unknown>;
  closing?: boolean;
}

const DateInput = ({ value, onChange, label }: { value: string | null; onChange: (v: string | null) => void; label: string }) => (
  <input className="inp num" type="date" aria-label={label} value={value ?? ''} onChange={(e: Event) => onChange(isDateStr((e.target as HTMLInputElement).value) ? (e.target as HTMLInputElement).value : null)} />
);

/* ---------- タスク ---------- */
export function TaskSheet({ props, closing }: SheetProps) {
  const id = props.id as string;
  const t = useData((d) => d.tasks.find((x) => x.id === id) ?? null);
  const vehicles = useData((d) => d.vehicles);
  const groups = useData((d) => d.groups);
  const people = useData(assignees, (a, b) => a.join('|') === b.join('|'));
  const [more, setMore] = useState(!!props.more);
  if (!t) return <Sheet title="タスク" closing={closing}><div className="empty">削除されました</div></Sheet>;
  const up = (patch: Parameters<typeof updateTask>[2]) => commit((d) => updateTask(d, id, patch), { undoable: true });
  const vGroups = groups.filter((g) => g.vehicleId === t.vehicleId);
  const parents = vGroups.filter((g) => !g.parentId).sort((a, b) => a.order - b.order);
  const n = t.start && t.due ? workdays(t.start, t.due, t.weekendWork) : 0;
  const pr = priorityOf(t, today());
  return (
    <Sheet
      title={t.title || 'タスク'}
      closing={closing}
      foot={
        <>
          <button type="button" className="btn danger" onClick={() => (closeSheet(), commit((d) => deleteTasks(d, [id]), { toast: `「${t.title}」を削除しました` }))}>
            <Icon name="trash" size={18} />
            削除
          </button>
          {/* 「完了」= 入力を終えて閉じる（タスクを完了にはしない。完了にするのは上の「済み」のスイッチ） */}
          <button
            type="button"
            className="btn primary"
            aria-label="入力完了（閉じる）"
            onClick={() => {
              (document.activeElement as HTMLElement | null)?.blur?.();
              setTimeout(closeSheet, 0);
            }}
          >
            <Icon name="check" size={18} />
            完了
          </button>
        </>
      }
    >
      <Field label="タスク名">
        <TextInput value={t.title} onCommit={(v) => up({ title: v })} autoFocus={!!props.isNew} placeholder="タスク名" />
      </Field>
      <Toggle label="このタスクは済み（完了）" hint="下の「完了」ボタンは、入力を終えて閉じるだけです" value={t.done} onChange={(v) => up({ done: v })} />
      <div className="grid2">
        <Field label="開始日">
          <DateInput label="開始日" value={t.start} onChange={(v) => up({ start: v })} />
        </Field>
        <Field label="期限">
          <DateInput label="期限" value={t.due} onChange={(v) => up({ due: v })} />
        </Field>
      </div>
      {t.start && t.due && <div className="micro">{`${shortDate(t.start)}〜${shortDate(t.due)}・作業日${n}日${t.weekendWork ? '（土日を含む）' : '（土日を除く）'}`}</div>}
      <Field label={`進捗 ${t.progress}%`}>
        <input type="range" min={0} max={100} step={10} value={t.progress} aria-label="進捗" style={{ accentColor: 'var(--green)' }} onInput={(e: Event) => up({ progress: Number((e.target as HTMLInputElement).value) })} />
      </Field>
      <Toggle label="土日も作業する" hint="オフのときは土日を作業日に含めず、ガントのバーも土日を空けます" value={t.weekendWork} onChange={(v) => up({ weekendWork: v })} />
      <Field label="優先度">
        <Seg value={String(t.priority)} onChange={(v) => up({ priority: Number(v) as Priority })} options={PRIORITY_CHOICES.map((p) => ({ value: String(p.v), label: p.label }))} label="優先度" />
      </Field>
      {!t.done && (
        <div className="pri-why" data-testid="priority-why">
          <PrioBadge info={pr} />
          <span>{pr.auto ? `自動: ${pr.reason}` : pr.reason}</span>
        </div>
      )}
      {!more ? (
        <button type="button" className="btn ghost" onClick={() => setMore(true)}>
          <Icon name="down" size={16} />
          車種・グループ・担当者・メモ
        </button>
      ) : (
        <>
          <div className="grid2">
            <Field label="車種">
              <select className="inp" value={t.vehicleId ?? ''} onChange={(e: Event) => up({ vehicleId: (e.target as HTMLSelectElement).value || null })}>
                <option value="">車種なし</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="グループ">
              <select className="inp" value={t.groupId ?? ''} onChange={(e: Event) => up({ groupId: (e.target as HTMLSelectElement).value || null })}>
                <option value="">グループなし</option>
                {parents.map((g) => (
                  <React.Fragment key={g.id}>
                    <option value={g.id}>{g.name}</option>
                    {vGroups
                      .filter((c) => c.parentId === g.id)
                      .sort((a, b) => a.order - b.order)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {`　└ ${c.name}`}
                        </option>
                      ))}
                  </React.Fragment>
                ))}
              </select>
            </Field>
          </div>
          <Field label="担当者">
            <TextInput value={t.assignee} onCommit={(v) => up({ assignee: v.trim() })} placeholder="名前" />
          </Field>
          {people.length > 0 && (
            <div className="chips" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
              {people.slice(0, 8).map((p) => (
                <button key={p} type="button" className="chip" aria-pressed={t.assignee === p ? 'true' : 'false'} onClick={() => up({ assignee: t.assignee === p ? '' : p })}>
                  <span>{p}</span>
                </button>
              ))}
            </div>
          )}
          <Field label="メモ">
            <TextInput multiline value={t.memo} onCommit={(v) => up({ memo: v })} placeholder="詳細" />
          </Field>
          <div className="micro">作成 {new Date(t.createdAt).toLocaleString('ja-JP')}・更新 {new Date(t.updatedAt).toLocaleString('ja-JP')}</div>
        </>
      )}
    </Sheet>
  );
}

/* ---------- グループ・子ツリー ---------- */
export function GroupSheet({ props, closing }: SheetProps) {
  const id = props.id as string | undefined;
  const g = useData((d) => (id ? d.groups.find((x) => x.id === id) ?? null : null));
  const vehicles = useData((d) => d.vehicles);
  const parent = useData((d) => (g?.parentId ? d.groups.find((x) => x.id === g.parentId) ?? null : null));
  const [name, setName] = useState('');
  const [vehicleId, setVehicleId] = useState<string>((props.vehicleId as string | null) ?? '');
  const [child, setChild] = useState('');
  const [task, setTask] = useState('');
  if (!id) {
    const create = () => {
      commit((d) => addGroup(d, { name, vehicleId: vehicleId || null }).data, { toast: `グループ「${name || 'グループ'}」を追加` });
      closeSheet();
    };
    return (
      <Sheet title="グループを追加" closing={closing} foot={<button type="button" className="btn primary" onClick={create}>追加</button>}>
        <Field label="グループ名">
          <input className="inp" value={name} autoFocus placeholder="例: ボデー設計" onInput={(e: Event) => setName((e.target as HTMLInputElement).value)} onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && !e.isComposing && create()} />
        </Field>
        <Field label="車種">
          <select className="inp" value={vehicleId} onChange={(e: Event) => setVehicleId((e.target as HTMLSelectElement).value)}>
            <option value="">車種なし</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
      </Sheet>
    );
  }
  if (!g) return <Sheet title="グループ" closing={closing}><div className="empty">削除されました</div></Sheet>;
  const isChild = !!g.parentId;
  return (
    <Sheet
      title={isChild ? `${parent?.name ?? ''} ／ ${g.name}` : g.name}
      closing={closing}
      foot={
        <button
          type="button"
          className="btn danger"
          onClick={() =>
            openSheet('confirm', {
              title: `「${g.name}」を削除しますか？`,
              body: isChild ? '中のタスクは親のグループへ移します（タスクは消えません）。' : '子ツリーも削除し、中のタスクは車種の直下へ移します（タスクは消えません）。',
              ok: '削除する',
              danger: true,
              run: () => (closeSheet(), commit((d) => deleteGroup(d, g.id), { toast: `「${g.name}」を削除しました` })),
            })
          }
        >
          <Icon name="trash" size={18} />
          削除
        </button>
      }
    >
      <Field label={isChild ? '子ツリー名' : 'グループ名'}>
        <TextInput value={g.name} onCommit={(v) => commit((d) => updateGroup(d, g.id, { name: v.trim() || g.name }))} />
      </Field>
      <form
        className="row"
        onSubmit={(e: Event) => {
          e.preventDefault();
          if (!task.trim()) return;
          commit((d) => addTask(d, { title: task, groupId: g.id }).data, { toast: `「${task}」を追加` });
          setTask('');
        }}
      >
        <input className="inp" value={task} placeholder="このグループにタスクを追加" onInput={(e: Event) => setTask((e.target as HTMLInputElement).value)} />
        <button type="submit" className="btn" aria-label="タスクを追加" disabled={!task.trim()}>
          <Icon name="plus" />
        </button>
      </form>
      {!isChild && (
        <form
          className="row"
          onSubmit={(e: Event) => {
            e.preventDefault();
            if (!child.trim()) return;
            commit((d) => addGroup(d, { name: child, vehicleId: g.vehicleId, parentId: g.id }).data, { toast: `子ツリー「${child}」を追加` });
            setChild('');
          }}
        >
          <input className="inp" value={child} placeholder="子ツリーを追加" onInput={(e: Event) => setChild((e.target as HTMLInputElement).value)} />
          <button type="submit" className="btn" aria-label="子ツリーを追加" disabled={!child.trim()}>
            <Icon name="plus" />
          </button>
        </form>
      )}
      <GroupColorField g={g} />
      {!isChild && <Toggle label="最上位に固定" hint="一覧とガントのいちばん上に表示します" value={g.pinned} onChange={(v) => commit((d) => updateGroup(d, g.id, { pinned: v }))} />}
      <div className="row">
        <span className="grow">並び順</span>
        <button type="button" className="btn small" onClick={() => commit((d) => moveGroup(d, g.id, -1))}>
          <Icon name="up" size={16} />
          上へ
        </button>
        <button type="button" className="btn small" onClick={() => commit((d) => moveGroup(d, g.id, 1))}>
          <Icon name="down" size={16} />
          下へ
        </button>
      </div>
    </Sheet>
  );
}

/* ---------- 車種 ---------- */
export function VehicleSheet({ props, closing }: SheetProps) {
  const id = props.id as string | undefined;
  const v = useData((d) => (id ? d.vehicles.find((x) => x.id === id) ?? null : null));
  const [name, setName] = useState('');
  if (!id) {
    const create = () => {
      if (!name.trim()) return;
      commit((d) => {
        const r = addVehicle(d, name);
        return setSettings(r.data, { vehicle: r.vehicle.id });
      }, { toast: `車種「${name}」を追加` });
      closeSheet();
    };
    return (
      <Sheet title="車種を追加" closing={closing} foot={<button type="button" className="btn primary" disabled={!name.trim()} onClick={create}>追加</button>}>
        <Field label="車種名">
          <input className="inp" value={name} autoFocus placeholder="例: A車" onInput={(e: Event) => setName((e.target as HTMLInputElement).value)} onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && !e.isComposing && create()} />
        </Field>
      </Sheet>
    );
  }
  if (!v) return <Sheet title="車種" closing={closing}><div className="empty">削除されました</div></Sheet>;
  return (
    <Sheet
      title={v.name}
      closing={closing}
      foot={
        <button
          type="button"
          className="btn danger"
          onClick={() =>
            openSheet('confirm', {
              title: `「${v.name}」を削除しますか？`,
              body: 'この車種のタスク・グループ・予定は消さずに「車種なし」へ移します。',
              ok: '削除する',
              danger: true,
              run: () => (closeSheet(), commit((d) => deleteVehicle(d, v.id), { toast: `「${v.name}」を削除しました` })),
            })
          }
        >
          <Icon name="trash" size={18} />
          削除
        </button>
      }
    >
      <Field label="車種名">
        <TextInput value={v.name} onCommit={(n) => commit((d) => updateVehicle(d, v.id, { name: n.trim() || v.name }))} />
      </Field>
      <Field label="色（ガントのバー・印）">
        <div className="swatches">
          {VEHICLE_COLORS.map((c) => (
            <button key={c} type="button" style={{ background: c }} aria-label={c} aria-pressed={v.color === c ? 'true' : 'false'} onClick={() => commit((d) => updateVehicle(d, v.id, { color: c }))} />
          ))}
        </div>
      </Field>
    </Sheet>
  );
}

export function VehiclePickSheet({ closing }: SheetProps) {
  const vehicles = useData((d) => d.vehicles);
  const cur = useData((d) => d.settings.vehicle);
  const pick = (v: string) => (commit((d) => setSettings(d, { vehicle: v }), { undoable: false }), closeSheet());
  return (
    <Sheet title="車種を選ぶ" closing={closing} short>
      <div className="group-card">
        <button type="button" className="item" onClick={() => pick('all')}>
          <span className="grow">すべて</span>
          {cur === 'all' && <Icon name="check" size={18} />}
        </button>
        {[...vehicles]
          .sort((a, b) => a.order - b.order)
          .map((v) => (
            <button key={v.id} type="button" className="item" onClick={() => pick(v.id)}>
              <i style={{ width: '0.75rem', height: '0.75rem', borderRadius: '50%', background: v.color }} />
              <span className="grow ellipsis">{v.name}</span>
              {cur === v.id && <Icon name="check" size={18} />}
            </button>
          ))}
      </div>
    </Sheet>
  );
}

/* ---------- 絞り込み ---------- */
const STATUS: { v: StatusFilter; label: string }[] = [
  { v: 'all', label: 'すべて' },
  { v: 'open', label: '未完了' },
  { v: 'done', label: '完了' },
  { v: 'overdue', label: '期限超過' },
  { v: 'today', label: '今日' },
  { v: 'week', label: '今週' },
  { v: 'urgent', label: '至急・高' },
];

export function FilterSheet({ closing }: SheetProps) {
  const status = useUI((u) => u.status);
  const assignee = useUI((u) => u.assignee);
  const query = useUI((u) => u.query);
  const people = useData(assignees, (a, b) => a.join('|') === b.join('|'));
  return (
    <Sheet
      title="絞り込み"
      closing={closing}
      foot={
        <>
          <button type="button" className="btn" onClick={() => setUI({ status: 'all', assignee: null, query: '' })}>
            解除
          </button>
          <button type="button" className="btn primary" onClick={() => closeSheet()}>
            閉じる
          </button>
        </>
      }
    >
      <Field label="状態">
        <div className="chips" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
          {STATUS.map((s) => (
            <button key={s.v} type="button" className="chip" aria-pressed={status === s.v ? 'true' : 'false'} onClick={() => setUI({ status: s.v })}>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </Field>
      <Field label="担当者">
        <div className="chips" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
          <button type="button" className="chip" aria-pressed={!assignee ? 'true' : 'false'} onClick={() => setUI({ assignee: null })}>
            <span>全員</span>
          </button>
          {people.map((p) => (
            <button key={p} type="button" className="chip" aria-pressed={assignee === p ? 'true' : 'false'} onClick={() => setUI({ assignee: p })}>
              <span>{p}</span>
            </button>
          ))}
          {people.length === 0 && <span className="micro">担当者を入れたタスクがありません</span>}
        </div>
      </Field>
      <Field label="ことば">
        <input className="inp" value={query} placeholder="タスク名・メモ・グループ" onInput={(e: Event) => setUI({ query: (e.target as HTMLInputElement).value })} />
      </Field>
      <div className="micro">車種は一覧の上のボタンで切り替えます。</div>
    </Sheet>
  );
}

/* ---------- グループへ移動（目次） ---------- */
export function jumpTo(groupId: string) {
  revealIn(document.querySelector<HTMLElement>(`[data-group-anchor="${groupId}"]`));
  setUI({ selected: `g:${groupId}` });
}

export function JumpSheet({ closing }: SheetProps) {
  const groups = useData((d) => d.groups);
  const vehicles = useData((d) => d.vehicles);
  const cur = useData((d) => d.settings.vehicle);
  const list = useMemo(() => {
    const vs = [...vehicles].sort((a, b) => a.order - b.order).filter((v) => cur === 'all' || v.id === cur);
    const sections: { name: string; color: string; items: { id: string; name: string; child: boolean }[] }[] = [];
    const add = (vid: string | null, name: string, color: string) => {
      const parents = groups.filter((g) => g.vehicleId === vid && !g.parentId).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order);
      const items = parents.flatMap((g) => [{ id: g.id, name: g.name, child: false }, ...groups.filter((c) => c.parentId === g.id).sort((a, b) => a.order - b.order).map((c) => ({ id: c.id, name: c.name, child: true }))]);
      if (items.length) sections.push({ name, color, items });
    };
    for (const v of vs) add(v.id, v.name, v.color);
    if (cur === 'all') add(null, '車種なし', 'var(--gray)');
    return sections;
  }, [groups, vehicles, cur]);
  return (
    <Sheet title="グループへ移動" closing={closing}>
      <button type="button" className="btn" onClick={() => (closeSheet(), setTimeout(() => openSheet('order'), 240))}>
        <Icon name="list" size={18} />
        大項目・グループの並び順を変える
      </button>
      {list.length === 0 && <div className="empty">グループはまだありません</div>}
      {list.map((s) => (
        <div key={s.name} className="stack" style={{ gap: '0.25rem' }}>
          <div className="res-head">{s.name}</div>
          <div className="group-card">
            {s.items.map((x) => (
              <button
                key={x.id}
                type="button"
                className="item"
                style={x.child ? { paddingLeft: '1.75rem', minHeight: '2.5rem', fontSize: '0.9rem', color: 'var(--ink-2)' } : { fontWeight: 700 }}
                onClick={() => {
                  closeSheet();
                  // 閉じてから移動（折りたたみを開く）
                  commit((d) => setGroupOpen(d, x.id, true), { undoable: false });
                  setTimeout(() => jumpTo(x.id), 60);
                }}
              >
                <i style={{ width: '0.25rem', height: '1rem', borderRadius: 2, background: s.color, flex: 'none' }} />
                <span className="grow ellipsis">{x.name}</span>
                <Icon name="right" size={16} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

/* ---------- 検索 ---------- */
export function SearchSheet({ closing }: SheetProps) {
  const data = useData((d) => d);
  const [q, setQ] = useState('');
  const r = useMemo(() => search(data, q), [data, q]);
  const vName = (id: string | null) => (id ? data.vehicles.find((v) => v.id === id)?.name ?? '' : '');
  const none = q.trim() && !r.tasks.length && !r.events.length && !r.groups.length && !r.vehicles.length && !r.plans.length;
  return (
    <Sheet title="検索" closing={closing}>
      <input className="inp" value={q} autoFocus placeholder="タスク・予定・大日程・車種" aria-label="検索" enterKeyHint="search" onInput={(e: Event) => setQ((e.target as HTMLInputElement).value)} />
      {none && <div className="empty">見つかりませんでした</div>}
      {r.vehicles.length > 0 && <div className="res-head">車種</div>}
      {r.vehicles.map((v) => (
        <button key={v.id} type="button" className="item" style={{ borderRadius: 'var(--r)' }} onClick={() => (closeSheet(), commit((d) => setSettings(d, { vehicle: v.id }), { undoable: false }), setTab('tasks'))}>
          <i style={{ width: '0.75rem', height: '0.75rem', borderRadius: '50%', background: v.color }} />
          <span className="grow ellipsis">{v.name}</span>
        </button>
      ))}
      {r.groups.length > 0 && <div className="res-head">グループ</div>}
      {r.groups.map((g) => (
        <button
          key={g.id}
          type="button"
          className="item"
          style={{ borderRadius: 'var(--r)' }}
          onClick={() => {
            closeSheet();
            commit((d) => setGroupOpen(setSettings(d, { vehicle: g.vehicleId ?? 'all' }), g.id, true), { undoable: false });
            setUI({ tasksView: 'tasks', status: 'all', query: '', assignee: null });
            setTab('tasks');
            setTimeout(() => jumpTo(g.id), 300);
          }}
        >
          <Icon name="folder" size={18} />
          <span className="grow ellipsis">{g.name}</span>
          <span className="micro">{vName(g.vehicleId)}</span>
        </button>
      ))}
      {r.tasks.length > 0 && <div className="res-head">タスク {r.tasks.length}件</div>}
      {r.tasks.map((t) => (
        <button key={t.id} type="button" className="item" style={{ borderRadius: 'var(--r)' }} onClick={() => openSheet('task', { id: t.id })}>
          <Icon name={t.done ? 'check' : 'tasks'} size={18} />
          <span className="grow" style={{ minWidth: 0 }}>
            <Reveal text={t.title || '無題'} />
          </span>
          <span className="micro num">{t.due ? shortDate(t.due, false) : ''}</span>
        </button>
      ))}
      {r.events.length > 0 && <div className="res-head">予定 {r.events.length}件</div>}
      {r.events.map((e) => (
        <button key={e.id} type="button" className="item" style={{ borderRadius: 'var(--r)' }} onClick={() => openSheet('event', { id: e.id })}>
          <Icon name="calendar" size={18} />
          <span className="grow" style={{ minWidth: 0 }}>
            <Reveal text={e.title || '予定'} />
          </span>
          <span className="micro num">{shortDate(e.date, false)}</span>
        </button>
      ))}
      {r.plans.length > 0 && <div className="res-head">大日程 {r.plans.length}件</div>}
      {r.plans.map((p) => (
        <button key={p.id} type="button" className="item" style={{ borderRadius: 'var(--r)' }} onClick={() => openSheet('plan', { id: p.id })}>
          <Icon name="flag" size={18} />
          <span className="grow" style={{ minWidth: 0 }}>
            <Reveal text={p.title} />
          </span>
          <span className="micro num">{`${vName(p.vehicleId) || '共通'}・${shortDate(p.start, false)}〜`}</span>
        </button>
      ))}
    </Sheet>
  );
}

/* ---------- 大項目（車種）とグループの並び順・折りたたみ ---------- */
export function OrderSheet({ closing }: SheetProps) {
  const vehicles = useData((d) => d.vehicles);
  const groups = useData((d) => d.groups);
  const collapsed = useData((d) => d.settings.collapsedV);
  const root = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = root.current;
    const sc = el?.closest<HTMLElement>('.sheet-body');
    if (!el || !sc) return;
    return attachSortable(el, {
      scroller: sc,
      onDrop: (_k, group, keys) => commit((d) => (group === 'veh' ? setVehicleOrder(d, keys) : setGroupOrder(d, keys))),
    });
  }, []);
  const vs = [...vehicles].sort((a, b) => a.order - b.order);
  const move = (list: string[], id: string, dir: -1 | 1) => {
    const i = list.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return list;
    const out = [...list];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  };
  const sections: { vid: string | null; name: string; color: string }[] = [...vs.map((v) => ({ vid: v.id as string | null, name: v.name, color: v.color })), { vid: null, name: '車種なし', color: 'var(--gray)' }];
  return (
    <Sheet title="大項目の並び順" closing={closing}>
      <div className="row">
        <button type="button" className="btn small grow" onClick={() => commit((d) => setAllVehiclesOpen(d, false), { undoable: false })}>
          <Icon name="up" size={16} />
          すべて閉じる
        </button>
        <button type="button" className="btn small grow" onClick={() => commit((d) => setAllVehiclesOpen(d, true), { undoable: false })}>
          <Icon name="down" size={16} />
          すべて開く
        </button>
      </div>
      <div className="micro">長押ししてドラッグ、または ▲▼ で並べ替え。目のボタンで折りたたみ</div>
      <div ref={root} className="stack order" style={{ gap: '0.25rem' }}>
        <div className="res-head">🚗 車種（大項目）</div>
        <div className="group-card">
          {vs.map((v, i) => (
            <div key={v.id} className="item oitem" data-sort-key={v.id} data-sort-group="veh">
              <Icon name="grip" size={18} />
              <i style={{ width: '0.6rem', height: '0.6rem', borderRadius: '50%', background: v.color, flex: 'none' }} />
              <span className="grow ellipsis">{v.name}</span>
              <button type="button" className="iconbtn" data-no-drag aria-label={`${v.name}を${collapsed.includes(v.id) ? '開く' : '閉じる'}`} onClick={() => commit((d) => toggleVehicleOpen(d, v.id), { undoable: false })}>
                <Icon name={collapsed.includes(v.id) ? 'hide' : 'eye'} size={18} />
              </button>
              <button type="button" className="iconbtn" data-no-drag aria-label={`${v.name}を上へ`} disabled={i === 0} onClick={() => commit((d) => setVehicleOrder(d, move(vs.map((x) => x.id), v.id, -1)))}>
                <Icon name="up" size={18} />
              </button>
              <button type="button" className="iconbtn" data-no-drag aria-label={`${v.name}を下へ`} disabled={i === vs.length - 1} onClick={() => commit((d) => setVehicleOrder(d, move(vs.map((x) => x.id), v.id, 1)))}>
                <Icon name="down" size={18} />
              </button>
            </div>
          ))}
          {vs.length === 0 && <div className="item micro">車種はまだありません</div>}
        </div>
        {sections.map((s) => {
          const list = groups.filter((g) => g.vehicleId === s.vid && !g.parentId).sort((a, b) => a.order - b.order);
          if (!list.length) return null;
          const ids = list.map((g) => g.id);
          return (
            <React.Fragment key={s.name}>
              <div className="res-head">📁 {s.name} のグループ</div>
              <div className="group-card">
                {list.map((g, i) => (
                  <div key={g.id} className="item oitem" data-sort-key={g.id} data-sort-group={`g:${s.vid ?? '-'}`}>
                    <Icon name="grip" size={18} />
                    <i style={{ width: '0.25rem', height: '1rem', borderRadius: 2, background: s.color, flex: 'none' }} />
                    <span className="grow ellipsis">{g.name}</span>
                    <button type="button" className="iconbtn" data-no-drag aria-label={`${g.name}を上へ`} disabled={i === 0} onClick={() => commit((d) => setGroupOrder(d, move(ids, g.id, -1)))}>
                      <Icon name="up" size={18} />
                    </button>
                    <button type="button" className="iconbtn" data-no-drag aria-label={`${g.name}を下へ`} disabled={i === list.length - 1} onClick={() => commit((d) => setGroupOrder(d, move(ids, g.id, 1)))}>
                      <Icon name="down" size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </Sheet>
  );
}

/* ---------- ホームの4分割: 枠のグループを選ぶ ---------- */
export function QuadSheet({ props, closing }: SheetProps) {
  const slot = props.slot as number;
  const by = props.by as 'priority' | 'group';
  const groups = useData((d) => d.groups);
  const vehicles = useData((d) => d.vehicles);
  const name = useData((d) => d.settings.quadNames[by][slot] ?? '');
  const cur = useData((d) => d.settings.quadGroups[slot] ?? null);
  const shown = props.groupId as string | null | undefined;
  const level = props.level as 1 | 2 | 3 | 4 | undefined;
  const auto = by === 'priority' ? LEVEL[level ?? 4].label : groups.find((g) => g.id === shown)?.name ?? 'グループ';
  const setName = (v: string) =>
    commit((d) => setSettings(d, { quadNames: { ...d.settings.quadNames, [by]: d.settings.quadNames[by].map((x, i) => (i === slot ? v.trim().slice(0, 30) : x)) } }), { undoable: false });
  const pick = (id: string | null) => commit((d) => setSettings(d, { quadGroups: d.settings.quadGroups.map((x, i) => (i === slot ? id : x === id && id ? null : x)) }), { undoable: false });
  // ホームとタスクは連動: この枠の中身を、タスクの一覧で開く
  const openInTasks = () => {
    closeSheet();
    if (by === 'priority') {
      commit((d) => setSortMode(d, 'priority'), { undoable: false });
      setUI({ tasksView: 'tasks', status: 'all', query: '', assignee: null });
      setTab('tasks');
      return;
    }
    const g = groups.find((x) => x.id === shown);
    if (!g) return;
    commit((d) => setGroupOpen(setSettings(d, { vehicle: g.vehicleId ?? 'all' }), g.id, true), { undoable: false });
    setUI({ tasksView: 'tasks', status: 'all', query: '', assignee: null });
    setTab('tasks');
    setTimeout(() => jumpTo(g.id), 300);
  };
  const sections = [...vehicles].sort((a, b) => a.order - b.order).map((v) => ({ name: v.name, color: v.color, id: v.id as string | null }));
  sections.push({ name: '車種なし', color: 'var(--gray)', id: null });
  return (
    <Sheet title={`${slot + 1}つ目の枠`} closing={closing}>
      <Field label="枠の名前（空にすると自動）">
        <TextInput value={name} placeholder={auto} onCommit={setName} />
      </Field>
      <button type="button" className="btn" onClick={openInTasks} disabled={by === 'group' && !shown}>
        <Icon name="tasks" size={18} />
        タスクの一覧で見る
      </button>
      {by === 'group' && (
        <>
          <div className="res-head">📁 この枠に出すグループ</div>
          <div className="group-card">
            <button type="button" className="item" onClick={() => pick(null)}>
              <span className="grow">自動で選ぶ（まだ使っていない上のグループ）</span>
              {!cur && <Icon name="check" size={18} />}
            </button>
          </div>
          {sections.map((s) => {
            const parents = groups.filter((g) => g.vehicleId === s.id && !g.parentId).sort((a, b) => a.order - b.order);
            if (!parents.length) return null;
            return (
              <div key={s.name} className="stack" style={{ gap: '0.25rem' }}>
                <div className="res-head">{s.name}</div>
                <div className="group-card">
                  {parents.flatMap((g) => [g, ...groups.filter((c) => c.parentId === g.id).sort((a, b) => a.order - b.order)]).map((g) => (
                    <button key={g.id} type="button" className="item" style={g.parentId ? { paddingLeft: '1.75rem', color: 'var(--ink-2)' } : { fontWeight: 700 }} onClick={() => (pick(g.id), closeSheet())}>
                      <i style={{ width: '0.25rem', height: '1rem', borderRadius: 2, background: s.color, flex: 'none' }} />
                      <span className="grow ellipsis">{g.name}</span>
                      {cur === g.id && <Icon name="check" size={18} />}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </Sheet>
  );
}

/* ---------- 大日程のイベント ---------- */
export function PlanSheet({ props, closing }: SheetProps) {
  const id = props.id as string | undefined;
  const p = useData((d) => (id ? d.plans.find((x) => x.id === id) ?? null : null));
  const vehicles = useData((d) => d.vehicles);
  const isNew = !id;
  const [draft, setDraft] = useState<PlanEvent>(() => {
    const r = snapWeeks((props.start as string) ?? today(), (props.start as string) ?? today());
    return { id: '', title: '', vehicleId: (props.vehicleId as string | null) ?? null, kind: 'other', load: 2, memo: '', start: r.start, end: addDaysD(r.start, 4 * 7 - 1), createdAt: 0, updatedAt: 0 };
  });
  if (!isNew && !p) return <Sheet title="イベント" closing={closing}><div className="empty">削除されました</div></Sheet>;
  const v = isNew ? draft : p!;
  const set = (patch: Partial<PlanEvent>) => {
    if (isNew) return setDraft((x) => ({ ...x, ...patch, ...snapWeeks(patch.start ?? x.start, patch.end ?? x.end) }));
    commit((d) => updatePlan(d, id!, patch), { undoable: true });
  };
  const weeks = weeksOf(v);
  const setWeeks = (n: number) => set({ end: addDaysD(v.start, Math.max(1, Math.min(104, n)) * 7 - 1) });
  const save = () => {
    if (!draft.title.trim()) return toast('イベント名を入れてください');
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = draft;
    commit((d) => addPlan(d, rest).data, { toast: `「${draft.title.trim()}」を大日程に追加` });
    closeSheet();
  };
  const remove = () => {
    closeSheet();
    commit((d) => deletePlan(d, id!), { toast: `「${p!.title}」を削除しました`, undoable: true });
  };
  return (
    <Sheet
      title={isNew ? 'イベントを追加' : v.title || 'イベント'}
      closing={closing}
      foot={
        isNew ? (
          <button type="button" className="btn primary" onClick={save}>
            追加
          </button>
        ) : (
          <button type="button" className="btn danger" onClick={remove}>
            <Icon name="trash" size={18} />
            削除
          </button>
        )
      }
    >
      <Field label="イベント名">
        {isNew ? (
          <input className="inp" value={draft.title} autoFocus placeholder="例: 1次試作" aria-label="イベント名" onInput={(e: Event) => set({ title: (e.target as HTMLInputElement).value })} onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && !e.isComposing && save()} />
        ) : (
          <TextInput value={v.title} onCommit={(x) => set({ title: x.trim() || v.title })} />
        )}
      </Field>
      <Field label="車種">
        <select className="inp" aria-label="車種" value={v.vehicleId ?? ''} onChange={(e: Event) => set({ vehicleId: (e.target as HTMLSelectElement).value || null })}>
          <option value="">共通（車種に関係しない）</option>
          {[...vehicles]
            .sort((a, b) => a.order - b.order)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="種類">
        <div className="chips" style={{ flexWrap: 'wrap', overflow: 'visible' }} role="group" aria-label="種類">
          {PLAN_KIND_ORDER.map((k) => (
            <button key={k} type="button" className="chip" aria-pressed={v.kind === k ? 'true' : 'false'} onClick={() => set({ kind: k })}>
              <i className="dot" style={{ background: PLAN_KINDS[k].color }} />
              <span className="emo" data-e={PLAN_KINDS[k].emoji} aria-hidden="true" />
              <span>{PLAN_KINDS[k].label}</span>
            </button>
          ))}
        </div>
      </Field>
      <div className="grid2">
        <Field label="開始の週">
          <input className="inp num" type="date" aria-label="開始の週" value={v.start} onChange={(e: Event) => {
            const s = (e.target as HTMLInputElement).value;
            if (isDateStr(s)) set({ start: s, end: addDaysD(startOfWeekD(s), weeks * 7 - 1) });
          }} />
        </Field>
        <Field label="週数">
          <div className="stepper weeks">
            <button type="button" className="iconbtn" aria-label="1週へらす" disabled={weeks <= 1} onClick={() => setWeeks(weeks - 1)}>
              <Icon name="left" size={18} />
            </button>
            <span className="num" aria-label="週数">{weeks}週</span>
            <button type="button" className="iconbtn" aria-label="1週ふやす" onClick={() => setWeeks(weeks + 1)}>
              <Icon name="right" size={18} />
            </button>
          </div>
        </Field>
      </div>
      <div className="micro num">{`${shortDate(v.start)}〜${shortDate(v.end)}（${weeks}週）`}</div>
      <Field label="負荷（週ごとの混み具合の合計に使います）">
        <Seg value={String(v.load)} onChange={(x) => set({ load: Number(x) as 1 | 2 | 3 })} options={[1, 2, 3].map((n) => ({ value: String(n), label: LOAD_LABEL[n as 1 | 2 | 3] }))} label="負荷" />
      </Field>
      <Field label="メモ">
        {isNew ? <AutoArea className="inp" value={draft.memo} placeholder="詳細" aria-label="メモ" onInput={(e: Event) => set({ memo: (e.target as HTMLTextAreaElement).value })} /> : <TextInput multiline value={v.memo} onCommit={(x) => set({ memo: x })} placeholder="詳細" />}
      </Field>
    </Sheet>
  );
}

/* ---------- 予定 ---------- */
export function EventSheet({ props, closing }: SheetProps) {
  const id = props.id as string | undefined;
  const ev = useData((d) => (id ? d.events.find((x) => x.id === id) ?? null : null));
  const vehicles = useData((d) => d.vehicles);
  const curVehicle = useData((d) => d.settings.vehicle);
  const [draft, setDraft] = useState<Partial<CalEvent>>(() => ({ title: '', date: (props.date as string) ?? today(), startTime: '10:00', endTime: '11:00', place: '', vehicleId: curVehicle === 'all' ? null : curVehicle, memo: '', repeat: 'none', until: null }));
  const isNew = !id;
  if (!isNew && !ev) return <Sheet title="予定" closing={closing}><div className="empty">削除されました</div></Sheet>;
  const v: Partial<CalEvent> = isNew ? draft : ev!;
  const set = (patch: Partial<CalEvent>) => (isNew ? setDraft((x) => ({ ...x, ...patch })) : commit((d) => updateEvent(d, id!, patch), { undoable: true }));
  const allDay = !v.startTime;
  const save = () => {
    if (!draft.title?.trim()) return toast('予定名を入れてください');
    commit((d) => addEvent(d, { ...(draft as CalEvent), title: draft.title!.trim() }).data, { toast: `予定「${draft.title}」を追加` });
    closeSheet();
  };
  const text = (k: 'title' | 'place' | 'memo', label: string, ph: string, multi = false) =>
    isNew ? (
      multi ? (
        <AutoArea className="inp" value={(v[k] as string) ?? ''} placeholder={ph} aria-label={label} onInput={(e: Event) => set({ [k]: (e.target as HTMLTextAreaElement).value })} />
      ) : (
        <input className="inp" value={(v[k] as string) ?? ''} placeholder={ph} aria-label={label} autoFocus={k === 'title'} onInput={(e: Event) => set({ [k]: (e.target as HTMLInputElement).value })} />
      )
    ) : (
      <TextInput value={(v[k] as string) ?? ''} onCommit={(x) => set({ [k]: x })} placeholder={ph} multiline={multi} />
    );
  return (
    <Sheet
      title={isNew ? '予定を追加' : v.title || '予定'}
      closing={closing}
      foot={
        isNew ? (
          <button type="button" className="btn primary" onClick={save}>
            追加
          </button>
        ) : (
          <>
            <button type="button" className="btn danger" onClick={() => (closeSheet(), commit((d) => deleteEvent(d, id!), { toast: `予定「${v.title}」を削除しました` }))}>
              <Icon name="trash" size={18} />
              削除
            </button>
            <button type="button" className="btn primary" onClick={() => closeSheet()}>
              閉じる
            </button>
          </>
        )
      }
    >
      <Field label="予定名">{text('title', '予定名', '例: 設計レビュー')}</Field>
      <div className="grid2">
        <Field label="日付">
          <DateInput label="日付" value={v.date ?? null} onChange={(x) => x && set({ date: x })} />
        </Field>
        <Field label="車種">
          <select className="inp" value={v.vehicleId ?? ''} onChange={(e: Event) => set({ vehicleId: (e.target as HTMLSelectElement).value || null })}>
            <option value="">なし</option>
            {vehicles.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Toggle label="終日" value={allDay} onChange={(x) => set(x ? { startTime: null, endTime: null } : { startTime: '10:00', endTime: '11:00' })} />
      {!allDay && (
        <div className="grid2">
          <Field label="開始">
            <input className="inp num" type="time" value={v.startTime ?? ''} aria-label="開始時刻" onChange={(e: Event) => set({ startTime: (e.target as HTMLInputElement).value || null })} />
          </Field>
          <Field label="終了">
            <input className="inp num" type="time" value={v.endTime ?? ''} aria-label="終了時刻" onChange={(e: Event) => set({ endTime: (e.target as HTMLInputElement).value || null })} />
          </Field>
        </div>
      )}
      <Field label="場所">{text('place', '場所', '例: 第2会議室')}</Field>
      <div className="grid2">
        <Field label="繰り返し">
          <select className="inp" value={v.repeat ?? 'none'} onChange={(e: Event) => set({ repeat: (e.target as HTMLSelectElement).value as CalEvent['repeat'] })}>
            {(Object.keys(REPEAT_LABEL) as CalEvent['repeat'][]).map((k) => (
              <option key={k} value={k}>
                {REPEAT_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        {v.repeat && v.repeat !== 'none' && (
          <Field label="いつまで">
            <DateInput label="繰り返しの終わり" value={v.until ?? null} onChange={(x) => set({ until: x })} />
          </Field>
        )}
      </div>
      <Field label="メモ">{text('memo', 'メモ', '', true)}</Field>
    </Sheet>
  );
}

/* ---------- チェックリスト ---------- */
export function ChecklistSheet({ props, closing }: SheetProps) {
  const id = props.id as string;
  const c = useData((d) => d.checklists.find((x) => x.id === id) ?? null);
  if (!c) return <Sheet title="リスト" closing={closing}><div className="empty">削除されました</div></Sheet>;
  return (
    <Sheet
      title={c.name}
      closing={closing}
      foot={
        <button type="button" className="btn danger" onClick={() => (closeSheet(), commit((d) => deleteChecklist(d, id), { toast: `「${c.name}」を削除しました` }))}>
          <Icon name="trash" size={18} />
          リストを削除
        </button>
      }
    >
      <Field label="リスト名">
        <TextInput value={c.name} onCommit={(v) => commit((d) => renameChecklist(d, id, v.trim() || c.name))} />
      </Field>
      <div className="micro">項目は長押しで並べ替え、タップで名前の変更・別のリストへの移動ができます。</div>
    </Sheet>
  );
}

export function CheckItemSheet({ props, closing }: SheetProps) {
  const listId = props.list as string;
  const itemId = props.id as string;
  const lists = useData((d) => d.checklists);
  const c = lists.find((x) => x.id === listId) ?? lists.find((x) => x.items.some((i) => i.id === itemId));
  const item = c?.items.find((x) => x.id === itemId);
  if (!c || !item) return <Sheet title="項目" closing={closing}><div className="empty">削除されました</div></Sheet>;
  const rename = (text: string) =>
    commit((d) => ({ ...d, checklists: d.checklists.map((l) => (l.id === c.id ? { ...l, items: l.items.map((x) => (x.id === itemId ? { ...x, text } : x)) } : l)), updatedAt: Date.now() }));
  return (
    <Sheet
      title="項目"
      closing={closing}
      foot={
        <button type="button" className="btn danger" onClick={() => (closeSheet(), commit((d) => deleteCheckItem(d, c.id, itemId), { toast: `「${item.text}」を削除しました` }))}>
          <Icon name="trash" size={18} />
          削除
        </button>
      }
    >
      <Field label="項目">
        <TextInput value={item.text} onCommit={(v) => rename(v)} autoFocus />
      </Field>
      {lists.length > 1 && (
        <Field label="別のリストへ移動">
          <select
            className="inp"
            value={c.id}
            onChange={(e: Event) => {
              const to = (e.target as HTMLSelectElement).value;
              const dest = lists.find((l) => l.id === to)!;
              commit((d) => moveCheckItem(d, itemId, to, [...[...dest.items].sort((a, b) => a.order - b.order).map((x) => x.id), itemId]), { toast: `「${dest.name}」へ移動しました` });
              closeSheet();
            }}
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
      )}
    </Sheet>
  );
}

/* ---------- 確認 ---------- */
export function ConfirmSheet({ props, closing }: SheetProps) {
  const p = props as { title: string; body: string; ok: string; danger?: boolean; run: () => void };
  return (
    <Sheet
      title={p.title}
      closing={closing}
      short
      foot={
        <>
          <button type="button" className="btn" onClick={() => closeSheet()}>
            やめる
          </button>
          <button
            type="button"
            className={`btn ${p.danger ? 'danger' : 'primary'}`}
            onClick={() => {
              closeSheet();
              p.run();
            }}
          >
            {p.ok}
          </button>
        </>
      }
    >
      <div style={{ lineHeight: 1.6 }}>{p.body}</div>
    </Sheet>
  );
}

/* ---------- ガントのバーの色 ---------- */
function GroupColorField({ g }: { g: Group }) {
  const data = useData((d) => d);
  const auto = autoGroupColor(data, g);
  return (
    <Field label={g.parentId ? '色（ガントの色分けが「グループ」のとき。自動 = 親と同じ色）' : '色（ガントの色分けが「グループ」のとき）'}>
      <div className="swatches">
        <button type="button" className="auto" style={{ background: auto }} aria-label="自動" aria-pressed={g.color == null ? 'true' : 'false'} onClick={() => commit((d) => updateGroup(d, g.id, { color: null }))}>
          自動
        </button>
        {GROUP_COLORS.map((c) => (
          <button key={c} type="button" style={{ background: c }} aria-label={c} aria-pressed={g.color === c ? 'true' : 'false'} onClick={() => commit((d) => updateGroup(d, g.id, { color: c }))} />
        ))}
      </div>
    </Field>
  );
}

/** バーの色分け（車種・グループ・優先度）。グループの色はここからも変えられる */
export function BarColorSheet({ closing }: SheetProps) {
  const mode = useData((d) => d.settings.barColor);
  const data = useData((d) => d);
  const gc = useMemo(() => groupColors(data), [data]);
  const vs = [...data.vehicles].sort((a, b) => a.order - b.order);
  const tops = data.groups.filter((g) => !g.parentId);
  return (
    <Sheet title="バーの色分け" closing={closing}>
      <Seg value={mode} onChange={(v) => commit((d) => setSettings(d, { barColor: v }), { undoable: false })} options={(['vehicle', 'group', 'priority'] as const).map((v) => ({ value: v, label: BAR_COLOR_LABEL[v] }))} label="バーの色分け" />
      {mode === 'priority' && (
        <div className="group-card legend">
          {([4, 3, 2, 1] as const).map((lv) => (
            <div key={lv} className="item">
              <i className="sw" style={{ background: PRIORITY_COLORS[lv] }} />
              <span className="grow">{LEVEL[lv].label}</span>
              <span className="micro">{LEVEL[lv].hint}</span>
            </div>
          ))}
        </div>
      )}
      {mode === 'vehicle' && (
        <div className="group-card legend">
          {vs.map((v) => (
            <button key={v.id} type="button" className="item" onClick={() => openSheet('vehicle', { id: v.id })}>
              <i className="sw" style={{ background: v.color }} />
              <span className="grow">{v.name}</span>
              <Icon name="right" size={16} />
            </button>
          ))}
        </div>
      )}
      {mode === 'group' && (
        <>
          <div className="micro">グループを押すと色を変えられます（子ツリーは親と同じ色。子ツリーの画面で別の色にもできます）</div>
          <div className="group-card legend">
            {[...vs.map((v) => v.id as string | null), null].flatMap((vid) =>
              tops
                .filter((g) => g.vehicleId === vid)
                .sort((a, b) => a.order - b.order)
                .map((g) => (
                  <button key={g.id} type="button" className="item" onClick={() => openSheet('group', { id: g.id })}>
                    <i className="sw" style={{ background: gc.get(g.id) }} />
                    <span className="grow ellipsis">{g.name}</span>
                    <span className="micro ellipsis">{vs.find((v) => v.id === vid)?.name ?? '車種なし'}</span>
                    <Icon name="right" size={16} />
                  </button>
                )),
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

/* ---------- 長押しのメニュー ---------- */
export interface MenuAction {
  label: string;
  icon: string;
  danger?: boolean;
  run: () => void;
}
export function MenuSheet({ props, closing }: SheetProps) {
  const p = props as { title: string; sub?: string; actions: MenuAction[] };
  return (
    <Sheet title={p.title} closing={closing} short>
      {p.sub && <div className="micro" style={{ marginTop: '-0.25rem' }}>{p.sub}</div>}
      <div className="group-card menu">
        {p.actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className={`item${a.danger ? ' danger' : ''}`}
            onClick={() => {
              closeSheet();
              a.run();
            }}
          >
            <Icon name={a.icon} size={18} />
            <span className="grow">{a.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** タスクの長押しメニュー（完了したタスクも、ここから消せる） */
export function taskMenu(id: string) {
  const d = getData();
  const t = d.tasks.find((x) => x.id === id);
  if (!t) return;
  const name = t.title || '無題';
  openSheet('menu', {
    title: name,
    sub: t.done ? '完了したタスク' : undefined,
    actions: [
      { label: '編集', icon: 'edit', run: () => openSheet('task', { id }) },
      { label: t.done ? '未完了に戻す' : '完了にする', icon: t.done ? 'undo' : 'check', run: () => commit((x) => updateTask(x, id, { done: !t.done }), { undoable: true, toast: t.done ? undefined : `「${name}」を完了` }) },
      { label: '削除', icon: 'trash', danger: true, run: () => commit((x) => deleteTasks(x, [id]), { undoable: true, toast: `「${name}」を削除しました` }) },
    ] as MenuAction[],
  });
}

/** グループの長押しメニュー */
export function groupMenu(id: string) {
  const g = getData().groups.find((x) => x.id === id);
  if (!g) return;
  openSheet('menu', {
    title: g.name,
    actions: [
      { label: '名前・設定を編集', icon: 'edit', run: () => openSheet('group', { id }) },
      { label: '並び順を変える', icon: 'sort', run: () => openSheet('order') },
      {
        label: '削除',
        icon: 'trash',
        danger: true,
        run: () =>
          openSheet('confirm', {
            title: `「${g.name}」を削除しますか？`,
            body: g.parentId ? '中のタスクは親のグループへ移します（タスクは消えません）。' : '子ツリーも削除し、中のタスクは車種の直下へ移します（タスクは消えません）。',
            ok: '削除する',
            danger: true,
            run: () => commit((x) => deleteGroup(x, id), { undoable: true, toast: `「${g.name}」を削除しました` }),
          }),
      },
    ] as MenuAction[],
  });
}

/** 車種の長押しメニュー */
export function vehicleMenu(id: string) {
  const v = getData().vehicles.find((x) => x.id === id);
  if (!v) return;
  openSheet('menu', {
    title: v.name,
    actions: [
      { label: '名前・色を編集', icon: 'edit', run: () => openSheet('vehicle', { id }) },
      { label: '並び順を変える', icon: 'sort', run: () => openSheet('order') },
      {
        label: '削除',
        icon: 'trash',
        danger: true,
        run: () =>
          openSheet('confirm', {
            title: `「${v.name}」を削除しますか？`,
            body: 'この車種のタスク・グループ・予定は消さずに「車種なし」へ移します。',
            ok: '削除する',
            danger: true,
            run: () => commit((x) => deleteVehicle(x, id), { undoable: true, toast: `「${v.name}」を削除しました` }),
          }),
      },
    ] as MenuAction[],
  });
}

export const SHEETS: Record<string, (p: SheetProps) => ReturnType<typeof ConfirmSheet>> = {
  task: TaskSheet,
  group: GroupSheet,
  vehicle: VehicleSheet,
  vehiclePick: VehiclePickSheet,
  filter: FilterSheet,
  jump: JumpSheet,
  search: SearchSheet,
  event: EventSheet,
  checklist: ChecklistSheet,
  checkItem: CheckItemSheet,
  confirm: ConfirmSheet,
  plan: PlanSheet,
  quad: QuadSheet,
  order: OrderSheet,
  report: ReportSheet,
  reports: ReportsSheet,
  menu: MenuSheet,
  barColor: BarColorSheet,
};

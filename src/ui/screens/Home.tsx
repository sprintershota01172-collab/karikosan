/** ホーム: 今日のタスクと直近の予定 */
import React, { useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { addTask, hideToday, postpone, setSettings, unhideToday } from '../../model/actions';
import { addDays, shortDate, today } from '../../model/dates';
import { comparePriority, LEVEL, priorityOf } from '../../model/priority';
import { occurrences } from '../../model/recur';
import { todayList } from '../../model/rows';
import type { AppData, ID, Task } from '../../model/types';
import { commit, openSheet, setTab, setUI, useData } from '../../store/store';
import { Check, PrioBadge, Reveal, Seg } from '../components/bits';
import { openCompose } from '../components/Compose';
import { SwipeRow } from '../components/Swipe';
import { completeTask, dueLabel, removeTask } from '../components/TaskList';
import { Icon } from '../icons';
import { vehicleColor } from '../view';
import { QuickAdd } from './Tasks';

/** 左へスワイプすると「延期」「除外」「削除」が出る行。大きくスワイプすると削除 */
function SwipeTask({ t, color }: { t: Task; color: string }) {
  const due = dueLabel(t);
  return (
    <SwipeRow
      flip={t.id}
      actions={[
        { label: '延期', icon: 'skip', tone: 'later', run: () => commit((d) => postpone(d, t.id), { toast: `「${t.title}」を次の作業日に延期` }) },
        { label: '除外', icon: 'hide', tone: 'hide', run: () => commit((d) => hideToday(d, t.id), { toast: `「${t.title}」を今日の一覧から外しました` }) },
        { label: '削除', icon: 'trash', tone: 'danger', run: () => removeTask(t) },
      ]}
    >
      <div className="trow" onClick={() => openSheet('task', { id: t.id })}>
        <Check on={t.done} label={`${t.title}を完了`} onChange={(v) => completeTask(t, v)} />
        <div className="title">
          <span className="vbar" style={{ background: color }} />
          <Reveal text={t.title || '無題'} />
        </div>
        <div className="meta">
          {t.progress > 0 && <span className="num">{t.progress}%</span>}
          <span className={`due num ${due.cls}`}>{due.text}</span>
        </div>
        <span style={{ width: '0.75rem', flex: 'none' }} />
      </div>
    </SwipeRow>
  );
}

function TodayView() {
  const data = useData((d) => d);
  const day = today();
  const { list, hidden } = useMemo(() => todayList(data, day), [data, day]);
  const events = useMemo(() => occurrences(data, day, addDays(day, 6)).slice(0, 12), [data, day]);
  const [showHidden, setShowHidden] = useState(false);
  const taskBox = useRef<HTMLDivElement | null>(null);
  // 優先度ごとに区切る（至急 → 高 → 中 → 低。todayList は優先度の高い順）
  const sections = useMemo(() => {
    const out: ({ key: string; head: 1 | 2 | 3 | 4; n: number } | { key: string; el: ReactElement })[] = [];
    let last = -1;
    for (const t of list) {
      const lv = priorityOf(t, day).level || 1;
      if (lv !== last) {
        out.push({ key: `h${lv}`, head: lv, n: list.filter((x) => (priorityOf(x, day).level || 1) === lv).length });
        last = lv;
      }
      out.push({ key: t.id, el: <SwipeTask key={t.id} t={t} color={vehicleColor(data, t.vehicleId)} /> });
    }
    return out;
  }, [list, day, data]);
  const eventBox = useRef<HTMLDivElement | null>(null);
  return (
    <>
      <div className="section-head">
        <span>今日のタスク</span>
        <span className="count num">{list.length}件</span>
        <span className="grow" />
      </div>
      <div className="scroll" style={{ flex: '0 1 auto', maxHeight: '58%' }} ref={taskBox}>
        {list.length === 0 && (
          <div className="empty" style={{ padding: '1.25rem 1rem' }}>
            <div>今日が期限・期間中のタスクはありません</div>
          </div>
        )}
        {sections.map((x) =>
          'head' in x ? (
            <div key={x.key} className={`prow small p${x.head}`} data-flip={x.key}>
              <span className="ptag">{LEVEL[x.head].label}</span>
              <span className="num pcount">{x.n}件</span>
            </div>
          ) : (
            x.el
          ),
        )}
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
      <QuickAdd
        placeholder="今日のタスクを追加"
        onAdd={(title) => {
          commit((d) => addTask(d, { title, due: day, vehicleId: d.settings.vehicle === 'all' ? null : d.settings.vehicle }).data);
          setUI({ selected: null });
        }}
      />
    </>
  );
}

/* ---------- 4分割 ---------- */

const QUAD_LEVELS = [4, 3, 2, 1] as const;

/** 4分割（グループ）の枠: 選んだグループ。選んでいない枠は、まだ使っていない上位のグループで埋める */
export function quadGroupIds(data: AppData): (ID | null)[] {
  const chosen = data.settings.quadGroups.map((id) => (id && data.groups.some((g) => g.id === id) ? id : null));
  const vOrder = new Map(data.vehicles.map((v) => [v.id, v.order]));
  const vo = (id: ID | null) => (id ? vOrder.get(id) ?? 1e9 : 2e9);
  const rest = data.groups
    .filter((g) => !g.parentId && !chosen.includes(g.id))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || vo(a.vehicleId) - vo(b.vehicleId) || a.order - b.order)
    .map((g) => g.id);
  return chosen.map((id) => id ?? rest.shift() ?? null);
}

function QuadRow({ t, day, showPri }: { t: Task; day: string; showPri: boolean }) {
  const due = dueLabel(t, day);
  return (
    <div className="qrow" onClick={() => openSheet('task', { id: t.id })}>
      <Check on={t.done} label={`${t.title}を完了`} onChange={(v) => completeTask(t, v)} />
      {showPri && <PrioBadge info={priorityOf(t, day)} compact />}
      <Reveal text={t.title || '無題'} />
      <span className={`due num ${due.cls}`}>{due.text}</span>
    </div>
  );
}

function Quadrant({ head, tone, count, tasks, day, showPri, onAdd, addLabel, onHead }: { head: string; tone: string; count: number; tasks: Task[]; day: string; showPri: boolean; onAdd?: (title: string) => void; addLabel: string; onHead?: () => void }) {
  return (
    <section className={`quad-cell ${tone}`} aria-label={head}>
      <header className="quad-head">
        <button type="button" className="qtag" onClick={onHead} disabled={!onHead} aria-label={onHead ? `${head}（グループを選ぶ）` : head}>
          <span className="ellipsis">{head}</span>
          {onHead && <Icon name="down" size={14} />}
        </button>
        <span className="num pcount">{count}</span>
        <span className="grow" />
        {onAdd && (
          <button type="button" className="iconbtn qadd" aria-label={`${head}に追加`} onClick={() => openCompose({ placeholder: addLabel, hint: `「${head}」に追加します`, onAdd })}>
            <Icon name="plus" size={18} />
          </button>
        )}
      </header>
      <div className="quad-list scroll">
        {tasks.length === 0 && <div className="qempty">なし</div>}
        {tasks.map((t) => (
          <QuadRow key={t.id} t={t} day={day} showPri={showPri} />
        ))}
      </div>
    </section>
  );
}

function QuadView() {
  const data = useData((d) => d);
  const by = data.settings.quadBy;
  const day = today();
  const open = useMemo(() => data.tasks.filter((t) => !t.done).sort(comparePriority(day)), [data.tasks, day]);
  const gIds = useMemo(() => quadGroupIds(data), [data]);
  return (
    <>
      <div className="toolbar">
        <div style={{ width: '12rem', flex: 'none' }}>
          <Seg value={by} onChange={(v) => commit((d) => setSettings(d, { quadBy: v }), { undoable: false })} options={[{ value: 'priority', label: '優先度' }, { value: 'group', label: 'グループ' }]} label="4分割の分け方" />
        </div>
        <span className="micro ellipsis grow">{by === 'priority' ? '未完了のタスクを優先度で' : '枠の名前を押すとグループを選べます'}</span>
      </div>
      <div className="quad">
        {by === 'priority'
          ? QUAD_LEVELS.map((lv) => {
              const list = open.filter((t) => (priorityOf(t, day).level || 1) === lv);
              return (
                <Quadrant
                  key={lv}
                  head={LEVEL[lv].label}
                  tone={`p${lv}`}
                  count={list.length}
                  tasks={list}
                  day={day}
                  showPri={false}
                  addLabel={`${LEVEL[lv].label}のタスクを追加`}
                  // 至急・高・中は手動の優先度にして、その枠に入るように。低は自動（期限なしは低）
                  onAdd={(title) => commit((d) => addTask(d, { title, priority: lv === 1 ? 0 : lv }).data)}
                />
              );
            })
          : gIds.map((gid, i) => {
              const g = gid ? data.groups.find((x) => x.id === gid) ?? null : null;
              const v = g?.vehicleId ? data.vehicles.find((x) => x.id === g.vehicleId) ?? null : null;
              const list = g ? (() => {
                const ids = new Set([g.id, ...data.groups.filter((c) => c.parentId === g.id).map((c) => c.id)]);
                return open.filter((t) => t.groupId != null && ids.has(t.groupId));
              })() : [];
              return (
                <Quadrant
                  key={i}
                  head={g ? g.name : 'グループを選ぶ'}
                  tone={`q${i}`}
                  count={list.length}
                  tasks={list}
                  day={day}
                  showPri
                  addLabel={g ? `${g.name}にタスクを追加` : ''}
                  onAdd={g ? (title) => commit((d) => addTask(d, { title, groupId: g.id }).data) : undefined}
                  onHead={() => openSheet('quadPick', { slot: i, vehicle: v?.name ?? '' })}
                />
              );
            })}
      </div>
    </>
  );
}

export function Home() {
  const mode = useData((d) => d.settings.homeMode);
  return (
    <div className="screen">
      <div style={{ flex: 'none' }}>
        <Seg value={mode} onChange={(v) => commit((d) => setSettings(d, { homeMode: v }), { undoable: false })} options={[{ value: 'today', label: '今日' }, { value: 'quad', label: '4分割' }]} label="ホームの表示" />
      </div>
      {mode === 'today' ? <TodayView /> : <QuadView />}
    </div>
  );
}

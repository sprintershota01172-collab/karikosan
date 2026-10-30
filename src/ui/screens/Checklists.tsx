/** 便利なチェックリスト（お土産リストなど）。グループ作成と最初の項目の追加を1回の入力で */
import React, { useEffect, useRef, useState } from 'react';
import { addCheckItem, addChecklist, moveCheckItem, toggleCheckItem, toggleChecklist } from '../../model/actions';
import type { Checklist } from '../../model/types';
import { commit, openSheet, useData } from '../../store/store';
import { Check, Reveal } from '../components/bits';
import { useFlip } from '../components/TaskList';
import { attachSortable } from '../drag/sortable';
import { Icon } from '../icons';

function ListBlock({ c }: { c: Checklist }) {
  const [v, setV] = useState('');
  const items = [...c.items].sort((a, b) => a.order - b.order);
  const done = items.filter((x) => x.done).length;
  return (
    <div className="stack" style={{ gap: 0 }}>
      <div className="grow-head" data-flip={`c:${c.id}`}>
        <button type="button" className="fold" aria-expanded={c.collapsed ? 'false' : 'true'} aria-label={c.collapsed ? '開く' : 'たたむ'} onClick={() => commit((d) => toggleChecklist(d, c.id), { undoable: false })}>
          <Icon name="down" size={16} />
        </button>
        <span className="name ellipsis grow">{c.name}</span>
        <span className="stat num">
          {done}/{items.length}
        </span>
        <button type="button" className="iconbtn" style={{ width: '2rem', height: '2rem' }} aria-label={`${c.name}のメニュー`} onClick={() => openSheet('checklist', { id: c.id })}>
          <Icon name="more" size={18} />
        </button>
      </div>
      {!c.collapsed && (
        <>
          {items.map((x) => (
            <div key={x.id} className={`crow${x.done ? ' done' : ''}`} data-sort-key={x.id} data-sort-group={c.id} data-flip={x.id}>
              <Check on={x.done} label={`${x.text}をチェック`} onChange={() => commit((d) => toggleCheckItem(d, c.id, x.id), { undoable: true })} />
              <button type="button" className="grow" style={{ border: 0, background: 'transparent', textAlign: 'left', padding: 0, height: '100%', minWidth: 0 }} onClick={() => openSheet('checkItem', { list: c.id, id: x.id })}>
                <Reveal text={x.text || '（空）'} />
              </button>
            </div>
          ))}
          <form
            onSubmit={(e: Event) => {
              e.preventDefault();
              if (!v.trim()) return;
              commit((d) => addCheckItem(d, c.id, v), { undoable: true });
              setV('');
            }}
            className="row"
            style={{ height: '2.625rem', borderBottom: '1px solid var(--line)' }}
          >
            <span style={{ width: '2.5rem', display: 'grid', placeItems: 'center', color: 'var(--ink-3)' }}>
              <Icon name="plus" size={16} />
            </span>
            <input className="inp" style={{ minHeight: '2.125rem', border: 0, background: 'transparent', padding: 0 }} value={v} placeholder="項目を追加" enterKeyHint="done" aria-label={`${c.name}に項目を追加`} onInput={(e: Event) => setV((e.target as HTMLInputElement).value)} />
          </form>
        </>
      )}
    </div>
  );
}

export function Checklists() {
  const lists = useData((d) => d.checklists);
  const sorted = [...lists].sort((a, b) => a.order - b.order);
  const [name, setName] = useState('');
  const scroller = useRef<HTMLDivElement | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!root.current || !scroller.current) return;
    return attachSortable(root.current, { scroller: scroller.current, onDrop: (key, group, keys) => commit((d) => moveCheckItem(d, key, group, keys)) });
  }, []);
  useFlip(root);
  return (
    <>
      <div className="scroll" ref={scroller}>
        <div className="list" ref={root}>
          {sorted.length === 0 && (
            <div className="empty">
              <div>お土産リストなど、仕事以外のちょっとしたリストに</div>
              <div className="micro">下の欄に「リスト名」を入れて追加。そのまま項目を書き足せます</div>
            </div>
          )}
          {sorted.map((c) => (
            <ListBlock key={c.id} c={c} />
          ))}
        </div>
      </div>
      <form
        className="quick"
        onSubmit={(e: Event) => {
          e.preventDefault();
          if (!name.trim()) return;
          // 「お土産: クッキー」のように書くと、リストと最初の項目を一度に作る
          const [n, first] = name.split(/[:：]/);
          commit((d) => addChecklist(d, n, first).data, { undoable: true });
          setName('');
        }}
      >
        <input className="inp" value={name} placeholder="新しいリスト（例: お土産：クッキー）" enterKeyHint="done" aria-label="リストを追加" onInput={(e: Event) => setName((e.target as HTMLInputElement).value)} />
        <button type="submit" className="btn primary" aria-label="リストを追加" disabled={!name.trim()}>
          <Icon name="plus" />
        </button>
      </form>
    </>
  );
}

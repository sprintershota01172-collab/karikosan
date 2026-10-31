import React, { useRef } from 'react';
import { setSettings } from '../../model/actions';
import { commit, openSheet, useData } from '../../store/store';
import { Seg } from '../components/bits';
import { VehicleChips } from '../components/VehicleChips';
import { Gantt } from '../gantt/Gantt';
import { Icon } from '../icons';
import { useRows } from '../view';
import { SortChip } from './Tasks';

export function GanttScreen() {
  const rows = useRows();
  const zoom = useData((d) => d.settings.ganttZoom);
  const sortMode = useData((d) => d.settings.sortMode);
  const api = useRef<((to: 'today' | 'prev' | 'next') => void) | null>(null);
  return (
    <div className="screen" style={{ paddingBottom: '0.5rem' }}>
      <VehicleChips />
      <div className="toolbar tb-gantt">
        <div className="zoom">
          <Seg value={zoom} onChange={(v) => commit((d) => setSettings(d, { ganttZoom: v }), { undoable: false })} options={[{ value: 'day', label: '日' }, { value: 'week', label: '週' }, { value: 'month', label: '月' }]} label="表示の単位" />
        </div>
        <SortChip mode={sortMode} />
        <button type="button" className="iconbtn" aria-label="大項目の並び順" onClick={() => openSheet('order')}>
          <Icon name="list" />
        </button>
        <span className="grow" />
        <button type="button" className="iconbtn step" aria-label="前へ" onClick={() => api.current?.('prev')}>
          <Icon name="left" />
        </button>
        <button type="button" className="btn small" onClick={() => api.current?.('today')}>
          今日
        </button>
        <button type="button" className="iconbtn step" aria-label="次へ" onClick={() => api.current?.('next')}>
          <Icon name="right" />
        </button>
      </div>
      <Gantt rows={rows} zoom={zoom} scrollApi={api} />
    </div>
  );
}

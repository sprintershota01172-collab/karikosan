import React, { useRef } from 'react';
import { setSettings, setSortMode } from '../../model/actions';
import { commit, useData } from '../../store/store';
import { Seg } from '../components/bits';
import { VehicleChips } from '../components/VehicleChips';
import { Gantt } from '../gantt/Gantt';
import { Icon } from '../icons';
import { useRows } from '../view';

export function GanttScreen() {
  const rows = useRows();
  const zoom = useData((d) => d.settings.ganttZoom);
  const sortMode = useData((d) => d.settings.sortMode);
  const api = useRef<((to: 'today' | 'prev' | 'next') => void) | null>(null);
  return (
    <div className="screen" style={{ paddingBottom: '0.5rem' }}>
      <VehicleChips />
      <div className="toolbar">
        <div style={{ width: '9.5rem' }}>
          <Seg value={zoom} onChange={(v) => commit((d) => setSettings(d, { ganttZoom: v }), { undoable: false })} options={[{ value: 'day', label: '日' }, { value: 'week', label: '週' }, { value: 'month', label: '月' }]} label="表示の単位" />
        </div>
        <button type="button" className="chip" aria-pressed="false" onClick={() => commit((d) => setSortMode(d, sortMode === 'manual' ? 'due' : 'manual'), { undoable: false })} aria-label={`並び順: ${sortMode === 'manual' ? '手動' : '期限順'}`}>
          <Icon name="sort" size={14} />
          <span>{sortMode === 'manual' ? '手動' : '期限順'}</span>
        </button>
        <span className="grow" />
        <button type="button" className="iconbtn" aria-label="前へ" onClick={() => api.current?.('prev')}>
          <Icon name="left" />
        </button>
        <button type="button" className="btn small" onClick={() => api.current?.('today')}>
          今日
        </button>
        <button type="button" className="iconbtn" aria-label="次へ" onClick={() => api.current?.('next')}>
          <Icon name="right" />
        </button>
      </div>
      <Gantt rows={rows} zoom={zoom} scrollApi={api} />
    </div>
  );
}

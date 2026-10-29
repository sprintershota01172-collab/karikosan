/** 一覧とガントで共通の「いま表示している行」 */
import { useMemo } from 'react';
import { today } from '../model/dates';
import { buildRows, type Row } from '../model/rows';
import { dataAtom, useData, useUI } from '../store/store';
import type { AppData } from '../model/types';

export function useRows(): Row[] {
  const data = useData((d) => d);
  const status = useUI((u) => u.status);
  const assignee = useUI((u) => u.assignee);
  const query = useUI((u) => u.query);
  const day = today();
  return useMemo(
    () => buildRows(data, { vehicle: data.settings.vehicle, sortMode: data.settings.sortMode, showDone: data.settings.showDone, status, assignee, query, today: day }),
    [data, status, assignee, query, day],
  );
}

export const getData = (): AppData => dataAtom.get();

export const vehicleColor = (d: AppData, id: string | null): string => (id ? d.vehicles.find((v) => v.id === id)?.color ?? 'var(--green)' : 'var(--gray)');

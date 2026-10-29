/** タスク・予定・グループ・車種を横断して探す */
import { matchQuery } from './rows';
import type { AppData, CalEvent, Group, Task, Vehicle } from './types';

export interface SearchResult {
  tasks: Task[];
  events: CalEvent[];
  groups: Group[];
  vehicles: Vehicle[];
}

const norm = (s: string) => s.normalize('NFKC').toLowerCase();
const hit = (text: string, q: string) => {
  const h = norm(text);
  return norm(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => h.includes(w));
};

export function search(data: AppData, q: string, limit = 50): SearchResult {
  if (!q.trim()) return { tasks: [], events: [], groups: [], vehicles: [] };
  const vName = new Map(data.vehicles.map((v) => [v.id, v.name]));
  const gName = new Map(data.groups.map((g) => [g.id, g.name]));
  const tasks = data.tasks.filter((t) => matchQuery(t, q, t.groupId ? gName.get(t.groupId) ?? '' : '', t.vehicleId ? vName.get(t.vehicleId) ?? '' : '')).slice(0, limit);
  const events = data.events.filter((e) => hit(`${e.title} ${e.place} ${e.memo} ${e.vehicleId ? vName.get(e.vehicleId) ?? '' : ''}`, q)).slice(0, limit);
  const groups = data.groups.filter((g) => hit(g.name, q)).slice(0, limit);
  const vehicles = data.vehicles.filter((v) => hit(v.name, q)).slice(0, limit);
  return { tasks, events, groups, vehicles };
}

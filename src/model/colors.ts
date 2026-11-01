/**
 * ガントのバーの色分け（車種・グループ・優先度）。画面と Excel で同じ色にする。
 *  - 車種: 車種の色
 *  - グループ: グループに決めた色。決めていなければ、グループの順番に色を割り当てる（子ツリーは親の色）
 *  - 優先度: 至急 = 赤、高 = だいだい、中 = 黄土、低 = 灰青、完了 = 灰
 */
import { priorityOf } from './priority';
import type { AppData, BarColorMode, DateStr, Group, ID, Task } from './types';

export const GROUP_COLORS = ['#2F6B5E', '#2F5F9E', '#A8672A', '#7A4E9C', '#B5473F', '#2D7F91', '#5F6E2E', '#8A5A3C'];
export const PRIORITY_COLORS: Record<number, string> = { 4: '#C23B32', 3: '#D46A25', 2: '#C08F0A', 1: '#5E7194', 0: '#9299A3' };
export const NEUTRAL = '#6B7684';
export const BAR_COLOR_LABEL: Record<BarColorMode, string> = { vehicle: '車種', group: 'グループ', priority: '優先度' };

/** 自動の色を含めたグループの色（id → 色） */
export function groupColors(d: Pick<AppData, 'groups' | 'vehicles'>): Map<ID, string> {
  const vOrder = new Map(d.vehicles.map((v) => [v.id, v.order]));
  const vo = (id: ID | null) => (id ? vOrder.get(id) ?? 1e9 : 2e9);
  const tops = d.groups.filter((g) => !g.parentId).sort((a, b) => vo(a.vehicleId) - vo(b.vehicleId) || a.order - b.order);
  const out = new Map<ID, string>();
  tops.forEach((g, i) => out.set(g.id, g.color ?? GROUP_COLORS[i % GROUP_COLORS.length]));
  for (const g of d.groups) if (g.parentId) out.set(g.id, g.color ?? out.get(g.parentId) ?? NEUTRAL);
  return out;
}

export function autoGroupColor(d: Pick<AppData, 'groups' | 'vehicles'>, g: Group): string {
  return groupColors({ ...d, groups: d.groups.map((x) => (x.id === g.id ? { ...x, color: null } : x)) }).get(g.id) ?? NEUTRAL;
}

/** 色を決める関数（1回作って、行ごとに呼ぶ） */
export function barColorer(d: Pick<AppData, 'groups' | 'vehicles' | 'settings'>, day: DateStr) {
  const mode = d.settings.barColor;
  const vc = new Map(d.vehicles.map((v) => [v.id, v.color]));
  const gc = groupColors(d);
  const vehicle = (id: ID | null) => (id ? vc.get(id) ?? NEUTRAL : NEUTRAL);
  return {
    mode,
    task: (t: Task): string => (mode === 'priority' ? PRIORITY_COLORS[priorityOf(t, day).level] : mode === 'group' ? (t.groupId ? gc.get(t.groupId) ?? vehicle(t.vehicleId) : vehicle(t.vehicleId)) : vehicle(t.vehicleId)),
    group: (g: Group): string => (mode === 'group' ? gc.get(g.id) ?? NEUTRAL : mode === 'priority' ? NEUTRAL : vehicle(g.vehicleId)),
    vehicle,
  };
}

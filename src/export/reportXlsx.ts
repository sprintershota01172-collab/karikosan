/**
 * 状況報告・ガント・状況一覧・大日程を Excel（.xlsx）にする。
 *  報告書   : 上司への報告用（数字・前回比・車種ごと・遅れ・今後の期限・前回からの完了・前回の課題・今回の課題・所感）
 *  ガント   : アプリと同じ並びのガント（日ごと。長い期間は週ごと）。予定は薄い色、進んだ分は濃い色、遅れは赤
 *  状況一覧 : タスクの一覧（所属・担当・開始・期限・進捗・優先度・状態）
 *  報告の履歴: 過去の報告の数字の推移
 *  大日程   : 車種ごとのイベント（1列 = 1週）
 */
import { addDays, diffDays, isWeekend, monthOf, shortDate, startOfWeek, today, toDay } from '../model/dates';
import { PLAN_KINDS, LOAD_LABEL, weeklyLoad, loadLevel } from '../model/plan';
import { lateDays, viewOf } from '../model/report';
import type { AppData, Report, ReportRow } from '../model/types';
import { buildXlsx, ref, type Cell, type SheetSpec, type Style } from './xlsx';

const NAVY = '#19283B';
const GOLD = '#A8874F';
const INK2 = '#4A5666';
const INK3 = '#8B929C';
const LINE = '#D9DDE3';
const PAPER = '#F5F3EE';
const RED = '#C8443A';
const GREEN = '#3D7469';
const LEVEL = ['', '低', '中', '高', '至急'];
const LEVEL_COLOR = ['', '#7D8AA0', '#C3940F', '#D9702F', RED];

/** 色を白と混ぜる（t = 白の割合） */
export function tint(hex: string, t: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h.slice(0, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()}`;
}
const solid = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : GREEN);

const H: Style = { bold: true, color: '#FFFFFF', fill: NAVY, border: 'all', borderColor: NAVY, align: 'center' };
const TD: Style = { border: 'all', borderColor: LINE };
const sec = (title: string): Cell[] => [{ v: title, s: { bold: true, size: 12, color: NAVY, border: 'bottom', borderColor: GOLD } }, ...Array.from({ length: 5 }, () => ({ v: '', s: { border: 'bottom', borderColor: GOLD } as Style }))];
const pct = (n: number): Cell => ({ v: n / 100, s: { ...TD, fmt: '0%', align: 'right' } });
const sign = (n: number, unit = '') => (n > 0 ? `+${n}${unit}` : n < 0 ? `${n}${unit}` : `±0${unit}`);
const date = (d: string | null, s: Style = TD): Cell => (d ? { v: d, date: true, s: { ...s, fmt: 'm/d', align: 'center' } } : { v: '', s });
const status = (r: ReportRow, day: string) => (r.done ? '完了' : r.overdue ? `遅れ（${lateDays(r, day)}日）` : r.progress > 0 ? '進行中' : '未着手');

/** 報告書のシート */
function reportSheet(r: Report, reports: Report[]): SheetSpec {
  const v = viewOf(r, reports);
  const rows: Cell[][] = [];
  const merges: string[] = [];
  const heights: Record<number, number> = {};
  const push = (cells: Cell[], h?: number) => {
    if (h) heights[rows.length] = h;
    rows.push(cells);
  };
  const mergeRow = (c0 = 0, c1 = 5) => merges.push(`${ref(rows.length - 1, c0)}:${ref(rows.length - 1, c1)}`);

  push([{ v: '状況報告', s: { bold: true, size: 18, color: NAVY } }], 30);
  push([{ v: `${r.scope}　｜　${shortDate(r.date)} 時点${v.prev ? `　｜　前回 ${shortDate(v.prev.date)}` : ''}`, s: { color: INK2 } }]);
  mergeRow();
  push([]);
  // 数字（大きく）と前回比
  const kHead: Style = { ...H, fill: NAVY };
  push([{ v: '進捗率', s: kHead }, { v: '完了', s: kHead }, { v: '遅れ', s: kHead }, { v: '7日以内の期限', s: kHead }, { v: '件数', s: kHead }]);
  const big: Style = { ...TD, bold: true, size: 16, align: 'center', color: NAVY };
  push([{ v: r.progress / 100, s: { ...big, fmt: '0%' } }, { v: r.done, s: big }, { v: r.overdue, s: { ...big, color: r.overdue ? RED : NAVY } }, { v: r.soon, s: big }, { v: r.total, s: big }], 28);
  const d = v.delta;
  const small: Style = { ...TD, align: 'center', color: INK3, size: 9 };
  push(d ? [{ v: `前回比 ${sign(d.progress, 'pt')}`, s: small }, { v: `前回比 ${sign(d.done)}`, s: small }, { v: `前回比 ${sign(d.overdue)}`, s: { ...small, color: d.overdue > 0 ? RED : INK3 } }, { v: '', s: small }, { v: '', s: small }] : [{ v: '前回の報告なし', s: small }, { v: '', s: small }, { v: '', s: small }, { v: '', s: small }, { v: '', s: small }]);
  push([]);

  if (v.vehicles.length) {
    push(sec('車種ごとの状況'));
    push([{ v: '車種', s: H }, { v: '進捗', s: H }, { v: '完了 / 件数', s: H }, { v: '遅れ', s: H }, { v: '開始', s: H }, { v: '終了', s: H }]);
    for (const x of v.vehicles) push([{ v: x.title, s: { ...TD, bold: true } }, pct(x.progress), { v: `${x.doneCount} / ${x.total}`, s: { ...TD, align: 'center' } }, { v: x.overdue || '', s: { ...TD, align: 'center', color: x.overdue ? RED : NAVY, bold: !!x.overdue } }, date(x.start), date(x.due)]);
    push([]);
  }

  const list = (title: string, items: ReportRow[], empty: string, cols: { h: string; f: (x: ReportRow) => Cell }[]) => {
    push(sec(`${title}（${items.length}件）`));
    if (!items.length) {
      push([{ v: empty, s: { color: INK3 } }]);
    } else {
      push(cols.map((c) => ({ v: c.h, s: H })));
      for (const x of items) push(cols.map((c) => c.f(x)));
    }
    push([]);
  };
  const name = (x: ReportRow): Cell => ({ v: x.title, s: { ...TD, wrap: true } });
  const where = (x: ReportRow): Cell => ({ v: x.where, s: { ...TD, color: INK2, size: 9, wrap: true } });
  const who = (x: ReportRow): Cell => ({ v: x.assignee, s: { ...TD, align: 'center' } });
  list('遅れているタスク', v.overdue, '遅れているタスクはありません', [
    { h: 'タスク', f: name },
    { h: '所属', f: where },
    { h: '担当', f: who },
    { h: '期限', f: (x) => date(x.due) },
    { h: '遅れ', f: (x) => ({ v: `${lateDays(x, r.date)}日`, s: { ...TD, align: 'center', color: RED, bold: true } }) },
    { h: '進捗', f: (x) => pct(x.progress) },
  ]);
  list('今後2週間の期限', v.upcoming, '2週間以内に期限のタスクはありません', [
    { h: 'タスク', f: name },
    { h: '所属', f: where },
    { h: '担当', f: who },
    { h: '期限', f: (x) => date(x.due) },
    { h: '優先度', f: (x) => ({ v: LEVEL[x.level] ?? '', s: { ...TD, align: 'center', bold: x.level >= 3, color: LEVEL_COLOR[x.level] || NAVY } }) },
    { h: '進捗', f: (x) => pct(x.progress) },
  ]);
  list(v.prev ? '前回からの完了' : '最近の完了（7日以内）', v.doneSince, '完了したタスクはありません', [
    { h: 'タスク', f: name },
    { h: '所属', f: where },
    { h: '担当', f: who },
    { h: '完了日', f: (x) => date(x.doneAt ? today(new Date(x.doneAt)) : null) },
  ]);

  if (v.prevIssues.length) {
    push(sec('前回の課題'));
    push([{ v: '課題', s: H }, { v: '', s: H }, { v: '', s: H }, { v: '前回', s: H }, { v: '今回', s: H }]);
    mergeRow(0, 2);
    for (const i of v.prevIssues) {
      const now = i.now === 'open' ? '対応中' : '解決';
      push([{ v: i.text, s: { ...TD, wrap: true } }, { v: '', s: TD }, { v: '', s: TD }, { v: i.was === 'open' ? '対応中' : '解決', s: { ...TD, align: 'center' } }, { v: now, s: { ...TD, align: 'center', bold: true, color: i.now === 'open' ? RED : GREEN } }]);
      mergeRow(0, 2);
    }
    push([]);
  }
  push(sec('課題'));
  if (!r.issues.length) push([{ v: '課題はありません', s: { color: INK3 } }]);
  else {
    push([{ v: '課題', s: H }, { v: '', s: H }, { v: '', s: H }, { v: '状態', s: H }, { v: '挙げた日', s: H }]);
    mergeRow(0, 2);
    for (const i of r.issues) {
      push([{ v: i.text, s: { ...TD, wrap: true } }, { v: '', s: TD }, { v: '', s: TD }, { v: i.status === 'open' ? '対応中' : '解決', s: { ...TD, align: 'center', bold: true, color: i.status === 'open' ? RED : GREEN } }, date(i.since)]);
      mergeRow(0, 2);
    }
  }
  push([]);
  push(sec('所感・連絡事項'));
  push([{ v: r.note || '—', s: { ...TD, wrap: true, valign: 'top', color: r.note ? NAVY : INK3 } }, { v: '', s: TD }, { v: '', s: TD }, { v: '', s: TD }, { v: '', s: TD }, { v: '', s: TD }], Math.max(36, Math.min(200, 15 * (r.note.split('\n').length + Math.floor(r.note.length / 40)) + 10)));
  mergeRow();
  return { name: '報告書', rows, cols: [30, 22, 11, 11, 10, 9], merges, heights, noGrid: true };
}

/** ガントのシート（日ごと。期間が長いときは週ごと） */
export function ganttSheet(r: Report): SheetSpec {
  const items = r.rows;
  let a = toDay(r.date) - 7;
  let b = toDay(r.date) + 28;
  for (const x of items) {
    if (x.kind !== 't') continue;
    if (x.start) a = Math.min(a, toDay(x.start));
    if (x.due) b = Math.max(b, toDay(x.due));
  }
  const from0 = addDays('1970-01-01', a - 2);
  const to = addDays('1970-01-01', b + 5);
  const weekly = diffDays(from0, to) > 120;
  const from = weekly ? startOfWeek(from0) : from0;
  const step = weekly ? 7 : 1;
  const n = Math.ceil((diffDays(from, to) + 1) / step);
  const FIX = 5;
  const rows: Cell[][] = [];
  const merges: string[] = [];

  rows.push([{ v: `ガントチャート　${r.scope}`, s: { bold: true, size: 14, color: NAVY } }]);
  rows.push([{ v: `${shortDate(r.date)} 時点　｜　${weekly ? '1列 = 1週' : '1列 = 1日'}　｜　薄い色 = 予定、濃い色 = 進んだ分、赤 = 遅れ`, s: { color: INK2, size: 9 } }]);
  // 月の見出し
  const mRow: Cell[] = Array.from({ length: FIX }, () => ({ v: '', s: { fill: PAPER } }));
  const dRow: Cell[] = [
    { v: '項目', s: H },
    { v: '担当', s: H },
    { v: '開始', s: H },
    { v: '期限', s: H },
    { v: '進捗', s: H },
  ];
  let cur = '';
  let start = FIX;
  for (let i = 0; i < n; i++) {
    const d = addDays(from, i * step);
    const { y, m } = monthOf(d);
    const k = `${y}-${m}`;
    if (k !== cur) {
      if (cur && i - 1 + FIX > start) merges.push(`${ref(2, start)}:${ref(2, i - 1 + FIX)}`);
      cur = k;
      start = i + FIX;
      mRow.push({ v: `${y}年${m}月`, s: { bold: true, color: NAVY, fill: PAPER, border: 'bottom', borderColor: LINE } });
    } else mRow.push({ v: '', s: { fill: PAPER, border: 'bottom', borderColor: LINE } });
    const isToday = weekly ? toDay(r.date) >= toDay(d) && toDay(r.date) < toDay(d) + 7 : d === r.date;
    const we = !weekly && isWeekend(d);
    dRow.push({ v: Number(d.slice(8, 10)), s: { align: 'center', size: 8, bold: isToday, color: isToday ? '#FFFFFF' : we ? INK3 : INK2, fill: isToday ? GOLD : we ? '#EEF0F2' : '#FAFAF8', border: 'all', borderColor: LINE } });
  }
  if (n - 1 + FIX > start) merges.push(`${ref(2, start)}:${ref(2, n - 1 + FIX)}`);
  rows.push(mRow, dRow);

  for (const x of items) {
    const head = x.kind !== 't';
    const nameS: Style = { ...TD, indent: x.depth, bold: head, fill: x.kind === 'v' ? '#E9ECEF' : x.kind === 'g' ? '#F4F5F6' : undefined, color: x.done ? INK3 : NAVY };
    const cells: Cell[] = [
      { v: head ? `${x.title}（${x.doneCount}/${x.total}）` : x.title, s: nameS },
      { v: x.assignee, s: { ...TD, align: 'center', fill: nameS.fill } },
      date(x.start, { ...TD, fill: nameS.fill }),
      date(x.due, { ...TD, fill: nameS.fill }),
      { v: x.progress / 100, s: { ...TD, fmt: '0%', align: 'right', fill: nameS.fill } },
    ];
    const s0 = x.start ? toDay(x.start) : null;
    const e0 = x.due ? toDay(x.due) : null;
    const color = solid(x.color);
    // 進んだ分: 期間 × 進捗
    const span = s0 != null && e0 != null ? e0 - s0 + 1 : 0;
    const doneTo = s0 != null ? s0 + Math.round((span * x.progress) / 100) - 1 : -Infinity;
    for (let i = 0; i < n; i++) {
      const d = addDays(from, i * step);
      const c0 = toDay(d);
      const c1 = c0 + step - 1;
      const on = s0 != null && e0 != null && s0 <= c1 && e0 >= c0;
      const isToday = toDay(r.date) >= c0 && toDay(r.date) <= c1;
      const we = !weekly && isWeekend(d);
      let fill: string | undefined = we ? '#F3F4F6' : undefined;
      if (on) {
        if (head) fill = tint(color, 0.45);
        else if (x.done) fill = tint(color, 0.55);
        else if (doneTo >= c0) fill = color;
        else if (x.overdue) fill = tint(RED, 0.4);
        else fill = tint(color, 0.42);
      }
      cells.push({ v: '', s: { fill, border: 'all', borderColor: isToday ? GOLD : '#E6E8EB' } });
    }
    rows.push(cells);
  }
  return { name: 'ガント', rows, cols: [28, 8, 7, 7, 6, ...Array.from({ length: n }, () => (weekly ? 4 : 2.8))], merges, freeze: { rows: 4, cols: FIX }, landscape: true, heights: { 0: 24 }, noGrid: true };
}

/** 状況一覧のシート */
function listSheet(r: Report): SheetSpec {
  const rows: Cell[][] = [];
  rows.push([{ v: `状況一覧　${r.scope}`, s: { bold: true, size: 14, color: NAVY } }]);
  rows.push([{ v: `${shortDate(r.date)} 時点　${r.total}件（完了 ${r.done}・遅れ ${r.overdue}）`, s: { color: INK2, size: 9 } }]);
  rows.push(['所属', 'タスク', '担当', '開始', '期限', '進捗', '優先度', '状態'].map((h) => ({ v: h, s: H })));
  for (const x of r.rows) {
    if (x.kind !== 't') continue;
    const st = status(x, r.date);
    rows.push([
      { v: x.where, s: { ...TD, color: INK2 } },
      { v: x.title, s: { ...TD, color: x.done ? INK3 : NAVY } },
      { v: x.assignee, s: { ...TD, align: 'center' } },
      date(x.start),
      date(x.due),
      pct(x.progress),
      { v: x.done ? '' : LEVEL[x.level] ?? '', s: { ...TD, align: 'center', bold: x.level >= 3, color: LEVEL_COLOR[x.level] || NAVY } },
      { v: st, s: { ...TD, align: 'center', bold: !x.done && !!x.overdue, color: x.done ? GREEN : x.overdue ? RED : NAVY } },
    ]);
  }
  return { name: '状況一覧', rows, cols: [26, 30, 9, 8, 8, 7, 7, 11], freeze: { rows: 3, cols: 0 }, landscape: true };
}

/** 報告の履歴（数字の推移） */
function historySheet(reports: Report[]): SheetSpec {
  const rows: Cell[][] = [];
  rows.push([{ v: '報告の履歴', s: { bold: true, size: 14, color: NAVY } }]);
  rows.push(['報告日', '対象', '進捗', '完了', '件数', '遅れ', '対応中の課題'].map((h) => ({ v: h, s: H })));
  for (const r of [...reports].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)) {
    const open = r.issues.filter((i) => i.status === 'open');
    rows.push([date(r.date, TD), { v: r.scope, s: TD }, pct(r.progress), { v: r.done, s: { ...TD, align: 'center' } }, { v: r.total, s: { ...TD, align: 'center' } }, { v: r.overdue, s: { ...TD, align: 'center', color: r.overdue ? RED : NAVY } }, { v: open.map((i) => i.text).join(' / '), s: { ...TD, wrap: true } }]);
  }
  return { name: '報告の履歴', rows, cols: [10, 18, 8, 7, 7, 7, 50], freeze: { rows: 2, cols: 0 } };
}

/** 大日程（1列 = 1週） */
function planSheet(d: AppData, day: string): SheetSpec | null {
  if (!d.plans.length) return null;
  let a = toDay(startOfWeek(day)) - 28;
  let b = toDay(day) + 26 * 7;
  for (const p of d.plans) {
    a = Math.min(a, toDay(p.start));
    b = Math.max(b, toDay(p.end));
  }
  const from = startOfWeek(addDays('1970-01-01', a));
  const n = Math.ceil((b - toDay(from) + 1) / 7);
  const FIX = 3;
  const rows: Cell[][] = [];
  const merges: string[] = [];
  rows.push([{ v: '大日程', s: { bold: true, size: 14, color: NAVY } }]);
  rows.push([{ v: `${shortDate(day)} 時点　｜　1列 = 1週（月曜はじまり）　｜　負荷 = 週ごとのイベントの重み（小1・中2・大3）の合計`, s: { color: INK2, size: 9 } }]);
  const mRow: Cell[] = Array.from({ length: FIX }, () => ({ v: '', s: { fill: PAPER } }));
  const wRow: Cell[] = [{ v: '車種', s: H }, { v: 'イベント', s: H }, { v: '期間', s: H }];
  let cur = '';
  let start = FIX;
  for (let i = 0; i < n; i++) {
    const w = addDays(from, i * 7);
    const { y, m } = monthOf(w);
    const k = `${y}-${m}`;
    if (k !== cur) {
      if (cur && i - 1 + FIX > start) merges.push(`${ref(2, start)}:${ref(2, i - 1 + FIX)}`);
      cur = k;
      start = i + FIX;
      mRow.push({ v: `${y}年${m}月`, s: { bold: true, color: NAVY, fill: PAPER } });
    } else mRow.push({ v: '', s: { fill: PAPER } });
    const now = toDay(day) >= toDay(w) && toDay(day) < toDay(w) + 7;
    wRow.push({ v: Number(w.slice(8, 10)), s: { align: 'center', size: 8, color: now ? '#FFFFFF' : INK2, fill: now ? GOLD : '#FAFAF8', border: 'all', borderColor: LINE } });
  }
  if (n - 1 + FIX > start) merges.push(`${ref(2, start)}:${ref(2, n - 1 + FIX)}`);
  rows.push(mRow, wRow);
  const loads = weeklyLoad(d.plans, from, n);
  rows.push([{ v: '負荷', s: { ...TD, bold: true } }, { v: '', s: TD }, { v: '', s: TD }, ...loads.map((x) => ({ v: x || '', s: { ...TD, align: 'center' as const, bold: true, size: 9, fill: ['#FFFFFF', '#E6F0EC', '#FBE9C4', '#F6D0CB'][loadLevel(x)], color: [INK3, GREEN, '#8A6A00', RED][loadLevel(x)] } }))]);
  const vs = [...d.vehicles].sort((x, y) => x.order - y.order);
  for (const v of [...vs.map((x) => x.id), null] as (string | null)[]) {
    const list = d.plans.filter((p) => p.vehicleId === v).sort((x, y) => x.start.localeCompare(y.start));
    if (!list.length) continue;
    const vname = v ? vs.find((x) => x.id === v)?.name ?? '' : '共通';
    list.forEach((p, j) => {
      const k = PLAN_KINDS[p.kind];
      const cells: Cell[] = [
        { v: j === 0 ? vname : '', s: { ...TD, bold: true } },
        { v: `${p.title}（${k.label}・${LOAD_LABEL[p.load]}）`, s: TD },
        { v: `${shortDate(p.start, false)}〜${shortDate(p.end, false)}`, s: { ...TD, size: 9, color: INK2 } },
      ];
      for (let i = 0; i < n; i++) {
        const w = toDay(from) + i * 7;
        const on = toDay(p.start) <= w + 6 && toDay(p.end) >= w;
        cells.push({ v: '', s: { fill: on ? tint(k.color, [0, 0.55, 0.3, 0][p.load]) : undefined, border: 'all', borderColor: '#E6E8EB' } });
      }
      rows.push(cells);
    });
  }
  return { name: '大日程', rows, cols: [14, 26, 12, ...Array.from({ length: n }, () => 3.6)], merges, freeze: { rows: 5, cols: FIX }, landscape: true, noGrid: true };
}

/** 報告の Excel（報告書・ガント・状況一覧・報告の履歴・大日程） */
export async function reportWorkbook(r: Report, d: AppData): Promise<Uint8Array> {
  const sheets = [reportSheet(r, d.reports), ganttSheet(r), listSheet(r)];
  if (d.reports.length) sheets.push(historySheet(d.reports));
  const p = planSheet(d, r.date);
  if (p) sheets.push(p);
  return buildXlsx(sheets, `状況報告 ${r.scope} ${r.date}`);
}

/** ガント画面からの Excel（ガント・状況一覧・大日程） */
export async function ganttWorkbook(r: Report, d: AppData): Promise<Uint8Array> {
  const sheets = [ganttSheet(r), listSheet(r)];
  const p = planSheet(d, r.date);
  if (p) sheets.push(p);
  return buildXlsx(sheets, `ガント ${r.scope} ${r.date}`);
}

export const xlsxName = (kind: string, r: Report) => `${kind}_${r.scope.replace(/[\\/:*?"<>|\s]+/g, '')}_${r.date.replace(/-/g, '')}.xlsx`;

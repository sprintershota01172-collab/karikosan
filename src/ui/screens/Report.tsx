/**
 * 状況報告（上司への報告用）。
 *  - ワンタップで作成: 今の状況を写し取って保存し、そのまま報告書を開く（同じ日・同じ対象なら取り直す）
 *  - 報告書: 数字と前回比・車種ごと・遅れ・今後2週間の期限・前回からの完了・前回の課題・今回の課題・所感
 *  - Excel: 報告書・ガント・状況一覧・報告の履歴・大日程のシート
 *  - 履歴: 過去の報告をさかのぼって開ける
 */
import React, { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { shortDate, today } from '../../model/dates';
import { addIssue, createReport, deleteReport, lateDays, removeIssue, setIssue, updateReport, viewOf, type ReportView } from '../../model/report';
import type { AppData, Report, ReportRow } from '../../model/types';
import { closeSheet, commit, getData, openSheet, toast, useData } from '../../store/store';
import { TextInput } from '../components/bits';
import { Sheet } from '../components/Sheet';
import { reportWorkbook, xlsxName } from '../../export/reportXlsx';
import { Icon } from '../icons';
import { shareOrDownload, XLSX_TYPE } from '../platform';
import type { SheetProps } from '../sheets';

/** ワンタップで報告を作る（今の車種の選択が対象） */
export function makeReport() {
  let res: { id: string; updated: boolean } = { id: '', updated: false };
  commit((d) => {
    const r = createReport(d, d.settings.vehicle, today());
    res = { id: r.report.id, updated: r.updated };
    return r.data;
  }, { undoable: true });
  openSheet('report', { id: res.id });
  toast(res.updated ? '今日の報告を最新の状況に更新しました' : '報告書を作成しました');
}

export async function exportReport(r: Report, d: AppData) {
  try {
    const bytes = await reportWorkbook(r, d);
    const res = await shareOrDownload(xlsxName('状況報告', r), bytes, XLSX_TYPE, `状況報告 ${shortDate(r.date)}`);
    if (res !== 'cancelled') toast(res === 'shared' ? 'Excel を共有しました' : 'Excel を保存しました');
  } catch (e) {
    toast(`Excel を作れませんでした（${String((e as Error)?.message ?? e)}）`);
  }
}

const sign = (n: number, unit = '') => (n > 0 ? `+${n}${unit}` : n < 0 ? `−${-n}${unit}` : `±0${unit}`);

function Kpi({ label, value, unit, delta, bad }: { label: string; value: number | string; unit?: string; delta?: string | null; bad?: boolean }) {
  return (
    <div className={`kpi${bad ? ' bad' : ''}`}>
      <span className="kl">{label}</span>
      <span className="kv num">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {delta != null && <span className="kd num">{delta}</span>}
    </div>
  );
}

function Rows({ items, right, limit = 6 }: { items: ReportRow[]; right: (x: ReportRow) => ReactNode; limit?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, limit);
  return (
    <div className="rlist">
      {shown.map((x, i) => (
        <div key={i} className="rrow">
          <span className="rdot" style={{ background: x.color }} />
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="ellipsis rt">{x.title}</span>
            {x.where && <span className="ellipsis rw">{x.where}</span>}
          </span>
          <span className="rr num">{right(x)}</span>
        </div>
      ))}
      {items.length > limit && (
        <button type="button" className="rmore" onClick={() => setAll(!all)}>
          {all ? '閉じる' : `ほか ${items.length - limit}件`}
        </button>
      )}
    </div>
  );
}

function Section({ title, count, children, tone }: { title: string; count?: number; children: ReactNode; tone?: string }) {
  return (
    <section className={`rsec${tone ? ` ${tone}` : ''}`}>
      <h3>
        {title}
        {count != null && <span className="num">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

function Issues({ r, v }: { r: Report; v: ReportView }) {
  const prevIds = new Set((v.prev?.issues ?? []).map((i) => i.id));
  const fresh = r.issues.filter((i) => !prevIds.has(i.id));
  const [text, setText] = useState('');
  const add = () => {
    if (!text.trim()) return;
    commit((d) => addIssue(d, r.id, text));
    setText('');
  };
  const toggle = (id: string, open: boolean) => commit((d) => setIssue(d, r.id, id, { status: open ? 'closed' : 'open' }));
  return (
    <>
      {v.prev && v.prev.issues.length > 0 && (
        <Section title="前回の課題" count={v.prev.issues.length}>
          <div className="rlist">
            {v.prev.issues.map((p) => {
              const cur = r.issues.find((x) => x.id === p.id);
              const open = cur?.status === 'open';
              return (
                <div key={p.id} className="irow">
                  {cur ? (
                    <button type="button" className={`istate${open ? ' open' : ''}`} aria-pressed={open ? 'false' : 'true'} aria-label={`${p.text}: ${open ? '対応中' : '解決'}（押して切り替え）`} onClick={() => toggle(p.id, open)}>
                      {open ? '対応中' : '解決'}
                    </button>
                  ) : (
                    <span className="istate">解決</span>
                  )}
                  <span className={`grow it${open ? '' : ' closed'}`}>{p.text}</span>
                  <span className="micro num">{shortDate(p.since, false)}〜</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}
      <Section title={v.prev ? '今回の課題' : '課題'} count={fresh.length || undefined}>
        <div className="rlist">
          {fresh.map((i) => {
            const open = i.status === 'open';
            return (
              <div key={i.id} className="irow">
                <button type="button" className={`istate${open ? ' open' : ''}`} aria-label={`${i.text}: ${open ? '対応中' : '解決'}（押して切り替え）`} onClick={() => toggle(i.id, open)}>
                  {open ? '対応中' : '解決'}
                </button>
                <span className={`grow it${open ? '' : ' closed'}`}>
                  <TextInput value={i.text} label={`課題: ${i.text}`} onCommit={(t) => commit((d) => (t.trim() ? setIssue(d, r.id, i.id, { text: t.trim() }) : removeIssue(d, r.id, i.id)))} />
                </span>
                <button type="button" className="iconbtn small" aria-label={`${i.text}を消す`} onClick={() => commit((d) => removeIssue(d, r.id, i.id))}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            );
          })}
          <div className="irow add">
            <input
              className="inp"
              value={text}
              placeholder="課題を追加（次回に引き継ぎます）"
              aria-label="課題を追加"
              enterKeyHint="done"
              onInput={(e: Event) => setText((e.target as HTMLInputElement).value)}
              onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && !e.isComposing && add()}
              onBlur={add}
            />
          </div>
        </div>
      </Section>
    </>
  );
}

export function ReportBody({ r, reports }: { r: Report; reports: Report[] }) {
  const v = useMemo(() => viewOf(r, reports), [r, reports]);
  const dl = v.delta;
  return (
    <div className="report" data-testid="report">
      <div className="rmeta">
        <span className="rscope">{r.scope}</span>
        <span className="num">{shortDate(r.date)} 時点</span>
        {v.prev && <span className="num micro">前回 {shortDate(v.prev.date)}</span>}
      </div>
      <div className="kpis">
        <Kpi label="進捗" value={r.progress} unit="%" delta={dl ? sign(dl.progress, 'pt') : null} />
        <Kpi label="完了" value={r.done} unit={`/${r.total}`} delta={dl ? sign(dl.done) : null} />
        <Kpi label="遅れ" value={r.overdue} unit="件" delta={dl ? sign(dl.overdue) : null} bad={r.overdue > 0} />
        <Kpi label="7日以内" value={r.soon} unit="件" />
      </div>
      {v.vehicles.length > 1 && (
        <Section title="車種ごと">
          <div className="rlist">
            {v.vehicles.map((x, i) => (
              <div key={i} className="vrow2">
                <span className="rdot" style={{ background: x.color }} />
                <span className="ellipsis grow">{x.title}</span>
                <span className="vbar2">
                  <i style={{ width: `${x.progress}%`, background: x.color }} />
                </span>
                <span className="num vp">{x.progress}%</span>
                <span className={`num vo${x.overdue ? ' bad' : ''}`}>{x.overdue ? `遅れ${x.overdue}` : ''}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
      <Section title="遅れ" count={v.overdue.length} tone={v.overdue.length ? 'bad' : ''}>
        {v.overdue.length ? <Rows items={v.overdue} right={(x) => <b className="late">{lateDays(x, r.date)}日</b>} /> : <p className="rnone">遅れているタスクはありません</p>}
      </Section>
      <Section title="今後2週間の期限" count={v.upcoming.length}>
        {v.upcoming.length ? <Rows items={v.upcoming} right={(x) => (x.due ? shortDate(x.due, false) : '')} /> : <p className="rnone">ありません</p>}
      </Section>
      <Section title={v.prev ? '前回からの完了' : '最近の完了'} count={v.doneSince.length}>
        {v.doneSince.length ? <Rows items={v.doneSince} right={() => <Icon name="check" size={14} />} /> : <p className="rnone">ありません</p>}
      </Section>
      <Issues r={r} v={v} />
      <Section title="所感・連絡事項">
        <TextInput multiline label="所感・連絡事項" value={r.note} placeholder="上司に伝えたいこと（任意）" onCommit={(t) => commit((d) => updateReport(d, r.id, { note: t }))} />
      </Section>
    </div>
  );
}

export function ReportSheet({ props, closing }: SheetProps) {
  const id = props.id as string;
  const reports = useData((d) => d.reports);
  const r = reports.find((x) => x.id === id) ?? null;
  if (!r)
    return (
      <Sheet title="状況報告" closing={closing}>
        <div className="empty">削除されました</div>
      </Sheet>
    );
  return (
    <Sheet
      title="状況報告"
      closing={closing}
      right={
        <button type="button" className="iconbtn" aria-label="報告の履歴" onClick={() => openSheet('reports')}>
          <Icon name="clock" />
        </button>
      }
      foot={
        <>
          <button
            type="button"
            className="btn ghost danger"
            style={{ flex: 'none' }}
            aria-label="この報告を削除"
            onClick={() => (closeSheet(), commit((d) => deleteReport(d, r.id), { undoable: true, toast: `${shortDate(r.date)}の報告を削除しました` }))}
          >
            <Icon name="trash" size={18} />
          </button>
          <button type="button" className="btn primary" onClick={() => void exportReport(r, getData())}>
            <Icon name="download" size={18} />
            Excel で出力
          </button>
        </>
      }
    >
      <ReportBody r={r} reports={reports} />
    </Sheet>
  );
}

/** 報告の履歴（新しい順）。押すとその報告を開く */
export function ReportsSheet({ closing }: SheetProps) {
  const reports = useData((d) => d.reports);
  return (
    <Sheet
      title="報告の履歴"
      closing={closing}
      foot={
        <button type="button" className="btn primary" onClick={() => (closeSheet(), makeReport())}>
          <Icon name="plus" size={18} />
          今の状況で報告書を作成
        </button>
      }
    >
      {reports.length === 0 && (
        <div className="empty">
          <div>まだ報告はありません</div>
        </div>
      )}
      <div className="rlist hist">
        {reports.map((r) => {
          const open = r.issues.filter((i) => i.status === 'open').length;
          return (
            <button key={r.id} type="button" className="hrow" onClick={() => openSheet('report', { id: r.id })}>
              <span className="hd num">{shortDate(r.date)}</span>
              <span className="grow ellipsis hs">{r.scope}</span>
              <span className="num hp">{r.progress}%</span>
              <span className={`num ho${r.overdue ? ' bad' : ''}`}>遅れ {r.overdue}</span>
              <span className="num hi">課題 {open}</span>
              <Icon name="right" size={16} />
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

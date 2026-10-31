// 状況報告: 写し・同じ日の取り直し・課題の引き継ぎ・前回との差、Excel の書き出し
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import JSZip from 'jszip';
import { ganttSheet, reportWorkbook, tint } from '../src/export/reportXlsx';
import { colName, excelDate } from '../src/export/xlsx';
import { setDone, updateTask } from '../src/model/actions';
import { addIssue, createReport, previousReport, setIssue, snapshotRows, viewOf } from '../src/model/report';
import { sampleData } from '../src/model/sample';
import { migrate, SCHEMA } from '../src/model/schema';

const DAY = '2026-11-02';

describe('状況報告', () => {
  it('アプリと同じ並びで写す（車種 → グループ → タスク）。数字が合う', () => {
    const d = sampleData(DAY);
    const rows = snapshotRows(d, 'all', DAY);
    assert.equal(rows[0].kind, 'v');
    const tasks = rows.filter((r) => r.kind === 't');
    assert.equal(tasks.length, d.tasks.length, '折りたたみに関係なく全タスク');
    const { report } = createReport(d, 'all', DAY);
    assert.equal(report.total, d.tasks.length);
    assert.equal(report.done, d.tasks.filter((t) => t.done).length);
    assert.equal(report.overdue, tasks.filter((t) => t.overdue).length);
  });

  it('同じ日・同じ対象はワンタップで取り直す（課題と所感は残る）。別の日は新しい報告で、対応中の課題を引き継ぐ', () => {
    let d = sampleData(DAY);
    const a = createReport(d, 'all', DAY);
    d = addIssue(a.data, a.report.id, '金型の発注が遅れている');
    d = addIssue(d, a.report.id, '評価の部屋の予約');
    const i2 = d.reports[0].issues[1].id;
    d = setIssue(d, a.report.id, i2, { status: 'closed' });
    const t = d.tasks.find((x) => !x.done)!;
    d = setDone(d, t.id, true);
    const again = createReport(d, 'all', DAY);
    assert.equal(again.updated, true);
    assert.equal(again.data.reports.length, 1);
    assert.equal(again.report.issues.length, 2, '課題は残る');
    assert.equal(again.report.done, a.report.done + 1, '状況は取り直す');
    // 1週間後
    const next = createReport(again.data, 'all', '2026-11-09');
    assert.equal(next.updated, false);
    assert.equal(next.data.reports.length, 2);
    assert.equal(next.data.reports[0].id, next.report.id, '新しい順');
    assert.deepEqual(next.report.issues.map((i) => i.text), ['金型の発注が遅れている'], '対応中だけ引き継ぐ');
    assert.equal(next.report.issues[0].since, DAY, '最初に挙げた日を保つ');
    assert.equal(previousReport(next.data.reports, next.report)?.id, a.report.id);
    const v = viewOf(next.report, next.data.reports);
    assert.ok(v.delta, '前回との差');
    assert.deepEqual(v.prevIssues.map((x) => [x.text, x.was, x.now]), [
      ['金型の発注が遅れている', 'open', 'open'],
      ['評価の部屋の予約', 'closed', 'gone'],
    ]);
  });

  it('過去の報告は、あとでタスクを変えても変わらない。保存して読み込み直しても同じ', () => {
    let d = sampleData(DAY);
    const a = createReport(d, 'all', DAY);
    d = a.data;
    const t = d.tasks[0];
    d = updateTask(d, t.id, { title: '名前を変えた', progress: 90 });
    const r = d.reports[0];
    assert.ok(!r.rows.some((x) => x.title === '名前を変えた'));
    const back = migrate(JSON.parse(JSON.stringify(d)));
    assert.equal(back.schema, SCHEMA);
    assert.deepEqual(back.reports, d.reports);
  });

  it('古いデータ（報告なし）も読み込める', () => {
    const d = sampleData(DAY) as unknown as Record<string, unknown>;
    delete d.reports;
    d.schema = 2;
    assert.deepEqual(migrate(d).reports, []);
  });
});

describe('Excel', () => {
  it('列の名前・日付の数値・色を薄める', () => {
    assert.equal(colName(0), 'A');
    assert.equal(colName(25), 'Z');
    assert.equal(colName(26), 'AA');
    assert.equal(colName(701), 'ZZ');
    assert.equal(excelDate('1900-03-01'), 61);
    assert.equal(excelDate('2026-11-02'), 46328);
    assert.equal(tint('#000000', 0.5), '#808080');
    assert.equal(tint('#3D7469', 0), '#3D7469');
  });

  it('ガントのシート: 全タスクの行があり、期間が長いときは週の列', () => {
    const d = sampleData(DAY);
    const { report } = createReport(d, 'all', DAY);
    const g = ganttSheet(report);
    assert.equal(g.rows.length, 4 + report.rows.length);
    const long = { ...report, rows: report.rows.map((x, i) => (i === 2 ? { ...x, due: '2027-12-31' } : x)) };
    assert.ok(ganttSheet(long).rows[1].some((c) => typeof c === 'object' && c && String(c.v).includes('1列 = 1週')));
  });

  it('報告の Excel: 報告書・ガント・状況一覧・報告の履歴・大日程のシート。中の XML が正しい', async () => {
    let d = sampleData(DAY);
    const a = createReport(d, 'all', DAY);
    d = addIssue(a.data, a.report.id, '試作部品の納期 <要確認> & 調整');
    const bytes = await reportWorkbook(d.reports[0], d);
    const zip = await JSZip.loadAsync(bytes);
    const wb = await zip.file('xl/workbook.xml')!.async('string');
    const names = [...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(names, ['報告書', 'ガント', '状況一覧', '報告の履歴', '大日程']);
    const s1 = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    assert.match(s1, /試作部品の納期 &lt;要確認&gt; &amp; 調整/);
    assert.match(s1, /状況報告/);
    if (process.env.XLSX_OUT) writeFileSync(process.env.XLSX_OUT, bytes);
  });
});

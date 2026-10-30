import React, { useEffect, useRef, useState } from 'react';
import { moveVehicle, setOneGroup, setSettings, setSortMode } from '../../model/actions';
import { sampleData } from '../../model/sample';
import { emptyData, toExport } from '../../model/schema';
import { listBackups, type Backup } from '../../store/db';
import { commit, openSheet, replaceData, toast, useData, useMeta } from '../../store/store';
import { Seg, Toggle } from '../components/bits';
import { Icon } from '../icons';
import { applyUpdate, BUILD, BUILT_AT, latestBuild, shareOrDownload } from '../platform';

export const FONT_PX = [12, 13, 14, 15, 16, 17, 18, 19, 20, 22];

export function Settings() {
  const s = useData((d) => d.settings);
  const vehicles = useData((d) => d.vehicles);
  const counts = useData((d) => `${d.tasks.length}|${d.events.length}`);
  const storage = useMeta((m) => m.storage);
  const [backups, setBackups] = useState<Backup[]>([]);
  useEffect(() => {
    listBackups().then(setBackups);
  }, []);
  const [nt, ne] = counts.split('|');
  const font = (n: number) => commit((d) => setSettings(d, { fontStep: Math.max(1, Math.min(10, n)) }), { undoable: false });
  const fileName = `karikosan-${new Date().toISOString().slice(0, 10)}.json`;
  const box = useRef<HTMLDivElement | null>(null);
  return (
    <div className="screen">
      <div className="scroll" ref={box}>
        <div className="sec">
          <h3>表示</h3>
          <div className="group-card" style={{ padding: '0.5rem 0.75rem' }}>
            <div className="row between" style={{ minHeight: '2.25rem' }}>
              <span>文字の大きさ</span>
              <span className="num micro">
                {s.fontStep} / 10
              </span>
            </div>
            <div className="stepper">
              <button type="button" className="iconbtn" aria-label="小さく" onClick={() => font(s.fontStep - 1)} disabled={s.fontStep <= 1}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>A</span>
              </button>
              <input type="range" min={1} max={10} step={1} value={s.fontStep} aria-label="文字の大きさ" onInput={(e: Event) => font(Number((e.target as HTMLInputElement).value))} />
              <button type="button" className="iconbtn" aria-label="大きく" onClick={() => font(s.fontStep + 1)} disabled={s.fontStep >= 10}>
                <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>A</span>
              </button>
            </div>
            <Toggle label="完了したタスクを表示" value={s.showDone} onChange={(v) => commit((d) => setSettings(d, { showDone: v }), { undoable: false })} />
            <div className="row between" style={{ minHeight: '2.75rem' }}>
              <span>タスクの並び順</span>
              <div style={{ width: '13rem', maxWidth: '62%' }}>
                <Seg value={s.sortMode} onChange={(v) => commit((d) => setSortMode(d, v), { undoable: false })} options={[{ value: 'manual', label: '手動' }, { value: 'due', label: '期限順' }, { value: 'priority', label: '優先度別' }]} label="並び順" />
              </div>
            </div>
            <Toggle label="グループは1つずつ開く" hint="グループを開くと、ほかのグループを閉じます。一覧とガントが1画面に収まります" value={s.oneGroup} onChange={(v) => commit((d) => setOneGroup(d, v), { undoable: false })} />
          </div>
        </div>

        <div className="sec">
          <h3>車種</h3>
          <div className="group-card">
            {[...vehicles]
              .sort((a, b) => a.order - b.order)
              .map((v, i, arr) => (
                <div key={v.id} className="item">
                  <i style={{ width: '0.75rem', height: '0.75rem', borderRadius: '50%', background: v.color, flex: 'none' }} />
                  <button type="button" className="grow ellipsis" style={{ border: 0, background: 'transparent', textAlign: 'left', padding: 0, minHeight: '2.75rem' }} onClick={() => openSheet('vehicle', { id: v.id })}>
                    {v.name}
                  </button>
                  <button type="button" className="iconbtn" aria-label={`${v.name}を上へ`} disabled={i === 0} onClick={() => commit((d) => moveVehicle(d, v.id, -1))}>
                    <Icon name="up" size={18} />
                  </button>
                  <button type="button" className="iconbtn" aria-label={`${v.name}を下へ`} disabled={i === arr.length - 1} onClick={() => commit((d) => moveVehicle(d, v.id, 1))}>
                    <Icon name="down" size={18} />
                  </button>
                </div>
              ))}
            <button type="button" className="item" onClick={() => openSheet('vehicle', {})}>
              <Icon name="plus" size={18} />
              <span>車種を追加</span>
            </button>
          </div>
        </div>

        <div className="sec">
          <h3>データ</h3>
          <div className="group-card">
            <div className="item" style={{ justifyContent: 'space-between' }}>
              <span>保存先</span>
              <span className="micro">{storage === 'indexeddb' ? 'この端末（IndexedDB）' : storage === 'localstorage' ? 'この端末（localStorage）' : '保存できない環境'}・タスク{nt}件・予定{ne}件</span>
            </div>
            <button
              type="button"
              className="item"
              onClick={async () => {
                const r = await shareOrDownload(fileName, JSON.stringify(toExport(commit((d) => d)), null, 1));
                if (r === 'saved') toast('ファイルに書き出しました');
              }}
            >
              <Icon name="download" size={18} />
              <span>書き出す（JSON）</span>
            </button>
            <label className="item" style={{ position: 'relative', cursor: 'pointer' }}>
              <Icon name="upload" size={18} />
              <span>ファイルから読み込む</span>
              <input
                type="file"
                accept="application/json,.json"
                aria-label="ファイルから読み込む"
                style={{ position: 'absolute', inset: 0, opacity: 0 }}
                onChange={(e: Event) => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  (e.target as HTMLInputElement).value = '';
                  if (!f) return;
                  f.text().then((text) => {
                    try {
                      const raw = JSON.parse(text);
                      openSheet('confirm', { title: 'データを読み込みますか？', body: 'いまのデータを、読み込んだデータに置き換えます。直後なら「元に戻す」で戻せます。', ok: '読み込む', run: () => replaceData(raw, '読み込みました') });
                    } catch {
                      toast('読み込めませんでした（karikosan で書き出した JSON を選んでください）');
                    }
                  });
                }}
              />
            </label>
            {backups.slice(0, 3).map((b) => (
              <button key={b.at} type="button" className="item" onClick={() => openSheet('confirm', { title: 'バックアップに戻しますか？', body: `${new Date(b.at).toLocaleString('ja-JP')} の状態に戻します。`, ok: '戻す', run: () => replaceData(b.data, 'バックアップに戻しました') })}>
                <Icon name="undo" size={18} />
                <span className="grow">自動バックアップ {new Date(b.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </button>
            ))}
            <button type="button" className="item" onClick={() => openSheet('confirm', { title: 'サンプルを入れますか？', body: '車種・グループ・タスク・予定の例で置き換えます。直後なら「元に戻す」で戻せます。', ok: '入れる', run: () => replaceData(sampleData(), 'サンプルを入れました') })}>
              <Icon name="list" size={18} />
              <span>サンプルで試す</span>
            </button>
            <button type="button" className="item" style={{ color: 'var(--red)' }} onClick={() => openSheet('confirm', { title: 'すべて削除しますか？', body: 'タスク・予定・チェックリスト・車種をすべて消します。直後なら「元に戻す」で戻せます。', ok: '削除する', danger: true, run: () => replaceData({ ...emptyData(), settings: s }, 'すべて削除しました') })}>
              <Icon name="trash" size={18} />
              <span>すべて削除</span>
            </button>
          </div>
        </div>

        <div className="sec">
          <h3>共同編集</h3>
          <div className="group-card" style={{ padding: '0.75rem' }}>
            <div className="row between">
              <span>複数の端末・メンバーで共有</span>
              <span className="micro">未設定</span>
            </div>
            <div className="micro" style={{ marginTop: '0.375rem', lineHeight: 1.6 }}>
              いまはこの端末の中だけに保存しています。共有には認証とリアルタイム同期のできる外部のバックエンド（Supabase など）の接続が必要です。別の端末へは「書き出す」「読み込む」で移せます。
            </div>
          </div>
        </div>

        <div className="sec">
          <h3>アプリ</h3>
          <div className="group-card">
            <div className="item" style={{ justifyContent: 'space-between' }}>
              <span>版</span>
              <span className="num micro">
                {BUILD}
                {BUILT_AT ? `（${BUILT_AT}）` : ''}
              </span>
            </div>
            <button
              type="button"
              className="item"
              onClick={async () => {
                const b = await latestBuild();
                if (!b) return toast('新しい版を確かめられませんでした（オフラインです）');
                if (b === BUILD) return toast('最新の版です');
                toast('新しい版を読み込みます');
                void applyUpdate();
              }}
            >
              <Icon name="refresh" size={18} />
              <span>新しい版を確かめる</span>
            </button>
            <div className="item micro" style={{ lineHeight: 1.6, minHeight: 0, padding: '0.625rem 0.75rem' }}>
              iPhone: Safari の共有ボタン →「ホーム画面に追加」でアプリとして使えます。オフラインでも動きます。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

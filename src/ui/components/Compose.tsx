/**
 * 追加の入力欄（画面の上に出す）。
 *
 * iPhone は、画面の下の方にある入力欄を触るとキーボードで隠れないよう画面全体を上へずらす（ヘッダーが逃げて、閉じると戻る＝画面が上下する）。
 * そこで、下の「＋ タスクを追加」を押したら、入力欄を画面の上に出してそこに文字を打つ。入力欄がキーボードより上にあるので、画面はずれない。
 *
 * キーボードは「押した瞬間に入力欄へフォーカスした」ときだけ出るので、入力欄は最初から置いておき（見えない状態）、
 * 押したときに同じ処理の中で focus() する。
 */
import React, { useRef, useState } from 'react';
import { uiAtom, useUI } from '../../store/store';
import { Icon } from '../icons';

export interface ComposeRequest {
  placeholder: string;
  /** 入力欄の上に出す説明（どこに追加されるか） */
  hint?: string;
  onAdd: (title: string) => void;
}

let current: ComposeRequest | null = null;
let input: HTMLInputElement | null = null;

/** 入力欄を開く（ボタンの click の中で呼ぶこと。キーボードを出すため） */
export function openCompose(r: ComposeRequest) {
  current = r;
  input?.focus({ preventScroll: true });
  uiAtom.set((u) => ({ ...u, compose: { placeholder: r.placeholder, hint: r.hint ?? '', n: 0, last: '' } }));
}

export function closeCompose() {
  current = null;
  uiAtom.set((u) => ({ ...u, compose: null }));
  input?.blur();
  clearDraft?.();
}
let clearDraft: (() => void) | null = null;

export function Compose() {
  const c = useUI((u) => u.compose);
  const [v, setV] = useState('');
  const vRef = useRef('');
  vRef.current = v;
  const box = useRef<HTMLFormElement | null>(null);
  clearDraft = () => setV('');
  const submit = () => {
    const t = vRef.current.trim();
    if (!t || !current) return;
    current.onAdd(t);
    setV('');
    uiAtom.set((u) => (u.compose ? { ...u, compose: { ...u.compose, n: u.compose.n + 1, last: t } } : u));
  };
  return (
    <>
      {c && <div className="backdrop light" onPointerDown={(e: PointerEvent) => (e.preventDefault(), closeCompose())} />}
      <form
        ref={box}
        className={`compose${c ? ' open' : ''}`}
        aria-hidden={c ? 'false' : 'true'}
        onSubmit={(e: Event) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e: KeyboardEvent) => e.key === 'Escape' && closeCompose()}
        onBlur={() =>
          // キーボードの「✓（完了）」などで入力欄から離れたら、打った文字を追加してから閉じる
          // （追加ボタンはフォーカスを外さないので閉じない。「×」と背景のタップは打った文字を捨てて閉じる）
          setTimeout(() => {
            if (!uiAtom.get().compose || box.current?.contains(document.activeElement)) return;
            if (vRef.current.trim()) submit();
            closeCompose();
          }, 0)
        }
      >
        <div className="compose-hint">
          <span className="ellipsis">{c?.hint}</span>
          {c && c.n > 0 && <span className="added ellipsis">{`「${c.last}」を追加しました${c.n > 1 ? `（${c.n}件）` : ''}`}</span>}
        </div>
        <div className="compose-row">
          <input
            ref={(el: HTMLInputElement | null) => {
              input = el;
            }}
            className="inp"
            value={v}
            placeholder={c?.placeholder ?? ''}
            aria-label={c?.placeholder ?? '追加'}
            enterKeyHint="send"
            tabIndex={c ? 0 : -1}
            onInput={(e: Event) => setV((e.target as HTMLInputElement).value)}
          />
          <button type="submit" className="btn primary" aria-label="追加" disabled={!v.trim()} onPointerDown={(e: PointerEvent) => e.preventDefault()}>
            <Icon name="plus" />
          </button>
          <button type="button" className="iconbtn" aria-label="閉じる" onPointerDown={(e: PointerEvent) => e.preventDefault()} onClick={closeCompose}>
            <Icon name="close" />
          </button>
        </div>
      </form>
    </>
  );
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../icons';

/** 1行で省略表示。PC ではホバーしたときだけ横に流して全文を見せる */
export function Reveal({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const onEnter = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const over = el.scrollWidth - el.clientWidth;
    if (over > 2) {
      el.classList.add('over');
      el.style.setProperty('--shift', `${-over - 8}px`);
      el.style.setProperty('--dur', `${Math.max(1.2, over / 60)}s`);
    } else el.classList.remove('over');
  }, []);
  return (
    <span ref={ref} className={`reveal ${className ?? ''}`} onMouseEnter={onEnter} title={undefined}>
      <span>{text}</span>
    </span>
  );
}

export function Check({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      className="check-hit"
      role="checkbox"
      aria-checked={on ? 'true' : 'false'}
      aria-label={label}
      data-no-drag
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        onChange(!on);
      }}
    >
      <span className="check" aria-checked={on ? 'true' : 'false'}>
        <Icon name="check" />
      </span>
    </button>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="toggle">
      <div className="grow">
        <div>{label}</div>
        {hint && <div className="micro">{hint}</div>}
      </div>
      <button type="button" role="switch" className="switch" aria-checked={value ? 'true' : 'false'} aria-label={label} onClick={() => onChange(!value)} />
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value ? 'true' : 'false'} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** 入力中は手元の値を持ち、確定（離れる・Enter）で保存する文字入力 */
export function TextInput({ value, onCommit, placeholder, autoFocus, multiline, id, onEnter }: { value: string; onCommit: (v: string) => void; placeholder?: string; autoFocus?: boolean; multiline?: boolean; id?: string; onEnter?: () => void }) {
  const [v, setV] = useState(value);
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setV(value);
    }
  }, [value]);
  const commitV = () => {
    if (v !== last.current) {
      last.current = v;
      onCommit(v);
    }
  };
  const common = {
    id,
    className: 'inp',
    value: v,
    placeholder,
    autoFocus,
    onInput: (e: Event) => setV((e.target as HTMLInputElement).value),
    onBlur: commitV,
  };
  return multiline ? (
    <textarea {...common} rows={3} />
  ) : (
    <input
      {...common}
      enterKeyHint="done"
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.isComposing) {
          commitV();
          onEnter?.();
        }
      }}
    />
  );
}

/** 完了率の小さな円 */
export function Ring({ value, size = 18, color = 'var(--green)' }: { value: number; size?: number; color?: string }) {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`完了 ${value}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-2)" strokeWidth="2.5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="2.5" strokeDasharray={`${(c * value) / 100} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

export const PRIORITY = [
  { v: 0, label: 'なし', color: 'transparent' },
  { v: 1, label: '低', color: '#9299A3' },
  { v: 2, label: '中', color: '#B7791F' },
  { v: 3, label: '高', color: '#C8443A' },
] as const;

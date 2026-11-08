import { useEffect, useState } from 'react';

const fmt = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '' : String(Math.round(v * 1000) / 1000));

interface NumberFieldProps {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  placeholder?: string;
  suffix?: string;
  step?: number;
  /** empty input = null (inherit) instead of being ignored */
  nullable?: boolean;
  disabled?: boolean;
  title?: string;
}

/** Text input that keeps what you're typing ("1.", "-") and only reports valid numbers. */
export function NumberField({ label, value, onChange, placeholder, suffix, step = 0.1, nullable, disabled, title }: NumberFieldProps) {
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(fmt(value));
  }, [value, focused]);

  const commit = (raw: string) => {
    setText(raw);
    if (raw.trim() === '') {
      if (nullable) onChange(null);
      return;
    }
    const v = Number(raw);
    if (Number.isFinite(v)) onChange(v);
  };

  return (
    <label className="field" title={title}>
      <span className="field-label">{label}</span>
      <span className={`input-wrap ${disabled ? 'disabled' : ''}`}>
        <input
          type="text"
          inputMode="decimal"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(fmt(value));
          }}
          onChange={e => commit(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
              commit(fmt((value ?? 0) + d));
            } else if (e.key === 'Enter' || e.key === 'Escape') {
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  title?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, title, disabled }: ToggleProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} title={title} aria-label={title} disabled={disabled}
      className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

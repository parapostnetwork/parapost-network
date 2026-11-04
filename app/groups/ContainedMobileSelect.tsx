'use client';

import { useId, useRef, useState } from 'react';
import styles from './ContainedMobileSelect.module.css';

type Option = {
  value: string;
  label: string;
};

export default function ContainedMobileSelect({
  label,
  value,
  options,
  onChange,
  disabled = false
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);

  const selected = options.find(option => option.value === value);

  return <div className={styles.mobileRoot}>
    <span className={styles.mobileLabel}>{label}</span>
    <button
      ref={trigger}
      type="button"
      className={styles.trigger}
      aria-expanded={open}
      aria-controls={id}
      disabled={disabled}
      onClick={() => setOpen(current => !current)}
    >
      <span>{selected?.label ?? value}</span>
      <span aria-hidden="true">{open ? '▴' : '▾'}</span>
    </button>

    {open && !disabled && <div
      id={id}
      className={styles.options}
      role="group"
      aria-label={`${label} choices`}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      {options.map(option =>
        <button
          type="button"
          key={option.value}
          className={styles.option}
          aria-pressed={value === option.value}
          onClick={() => {
            if (value !== option.value) {
              onChange(option.value);
            }
            setOpen(false);
          }}
        >
          <span>{option.label}</span>
          {value === option.value &&
            <span aria-hidden="true">✓</span>}
        </button>
      )}
    </div>}
  </div>;
}

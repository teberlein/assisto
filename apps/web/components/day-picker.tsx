'use client';

import { DAY_NAMES, DAY_NAMES_SHORT } from '@/lib/date';
import { cx } from './ui';

/** Selector múltiple de días de la semana (0 = domingo). */
export function DaysOfWeekPicker({
  value,
  onChange,
  legend,
  hint,
}: {
  value: number[];
  onChange: (value: number[]) => void;
  legend: string;
  hint?: string;
}) {
  function toggle(day: number) {
    onChange(
      value.includes(day)
        ? value.filter((d) => d !== day)
        : [...value, day].sort((a, b) => a - b),
    );
  }

  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-800">{legend}</legend>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {DAY_NAMES_SHORT.map((short, day) => {
          const selected = value.includes(day);
          return (
            <button
              key={short}
              type="button"
              role="checkbox"
              aria-checked={selected}
              aria-label={DAY_NAMES[day]}
              onClick={() => toggle(day)}
              className={cx(
                'min-w-12 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                selected
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {short}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

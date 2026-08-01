'use client';

import { forwardRef, useId, type ReactNode } from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ---------------------------------------------------------------- Button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-brand-700/50 border border-transparent',
  secondary:
    'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  ghost:
    'bg-transparent text-slate-700 border border-transparent hover:bg-slate-100 disabled:text-slate-400',
  danger:
    'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50 border border-transparent',
};

// Altura mínima táctil (~44px) para que sea cómodo tocar en mobile.
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm min-h-9',
  md: 'px-4 py-2.5 text-sm min-h-11',
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      className,
      children,
      disabled,
      type = 'button',
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cx(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
          'disabled:cursor-not-allowed',
          BUTTON_VARIANTS[variant],
          BUTTON_SIZES[size],
          fullWidth && 'w-full',
          className,
        )}
        {...rest}
      >
        {loading && <Spinner className="h-4 w-4" />}
        {children}
      </button>
    );
  },
);

/* --------------------------------------------------------------- Spinner */

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx('animate-spin', className ?? 'h-5 w-5')}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

/* ---------------------------------------------------------- Field / Input */

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: (props: { id: string; describedBy?: string }) => ReactNode;
}

export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
        {required && (
          <span className="ml-1 text-red-600" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children({ id, describedBy })}
      {hint && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

// text-base en mobile (16px) evita el zoom automático de iOS al enfocar un
// campo; en desktop volvemos a 14px. min-h-11 asegura un target táctil cómodo.
const CONTROL_CLASS =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500 sm:text-sm';

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(CONTROL_CLASS, className)} {...rest} />;
});

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx(CONTROL_CLASS, className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea ref={ref} className={cx(CONTROL_CLASS, className)} {...rest} />
  );
});

export function Checkbox({
  label,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        className={cx(
          'mt-0.5 h-4 w-4 shrink-0 rounded border-slate-400 text-brand-700 accent-brand-700',
          className,
        )}
        {...rest}
      />
      <label htmlFor={id} className="text-sm text-slate-700">
        {label}
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------ Card */

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'rounded-xl border border-slate-200 bg-white shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-slate-600">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/* ----------------------------------------------------------------- Badge */

type BadgeTone =
  | 'slate'
  | 'brand'
  | 'green'
  | 'amber'
  | 'red'
  | 'blue'
  | 'violet';

const BADGE_TONES: Record<BadgeTone, string> = {
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  brand: 'bg-brand-100 text-brand-800 border-brand-200',
  green: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  amber: 'bg-amber-100 text-amber-900 border-amber-300',
  red: 'bg-red-100 text-red-800 border-red-200',
  blue: 'bg-sky-100 text-sky-800 border-sky-200',
  violet: 'bg-violet-100 text-violet-800 border-violet-200',
};

export function Badge({
  tone = 'slate',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- Alertas */

export function Alert({
  tone = 'error',
  title,
  children,
  action,
}: {
  tone?: 'error' | 'info' | 'success' | 'warning';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    error: 'border-red-200 bg-red-50 text-red-900',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-300 bg-amber-50 text-amber-900',
  } as const;

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm',
        tones[tone],
      )}
    >
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------- Estados de carga/vacío */

export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 px-4 py-12 text-sm text-slate-600"
    >
      <Spinner className="h-5 w-5 text-brand-700" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium text-red-800">No pudimos cargar esto</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
          {description}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Tabs */

export function Tabs<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex rounded-lg border border-slate-300 bg-white p-1"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cx(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              selected
                ? 'bg-brand-700 text-white'
                : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

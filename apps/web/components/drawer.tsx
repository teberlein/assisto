'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Button, cx } from './ui';

/** Panel lateral (derecha en desktop, hoja inferior en mobile). */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex sm:justify-end">
      <button
        type="button"
        aria-label="Cerrar panel"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Detalle'}
        tabIndex={-1}
        className={cx(
          'relative mt-auto flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-white shadow-xl',
          'sm:mt-0 sm:h-full sm:max-h-none sm:w-[26rem] sm:rounded-none sm:border-l sm:border-slate-200',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-2 -mt-1"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ×
            </span>
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="border-t border-slate-200 px-5 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}

/** Diálogo de confirmación explícita para acciones destructivas. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Volver',
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Cancelar"
        onClick={onCancel}
        className="absolute inset-0 bg-slate-900/50"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <div className="mt-2 text-sm text-slate-600">{description}</div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

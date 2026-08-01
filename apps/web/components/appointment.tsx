'use client';

import { Badge } from './ui';
import type { AppointmentOrigin, AppointmentStatus } from '@/types/api';

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Agendado',
  CONFIRMED: 'Confirmado',
  AVAILABLE_FOR_REASSIGNMENT: 'Cupo liberado',
  CANCELLED: 'Cancelado',
  COMPLETED: 'Completado',
};

export const ORIGIN_LABEL: Record<AppointmentOrigin, string> = {
  WEB: 'Web',
  WHATSAPP: 'WhatsApp',
  REASSIGNMENT: 'Reasignado por el motor',
};

/** Colores del bloque en la grilla semanal. */
export const STATUS_BLOCK: Record<AppointmentStatus, string> = {
  SCHEDULED: 'bg-sky-100 border-sky-400 text-sky-950 hover:bg-sky-200',
  CONFIRMED:
    'bg-emerald-100 border-emerald-500 text-emerald-950 hover:bg-emerald-200',
  AVAILABLE_FOR_REASSIGNMENT:
    'stripes-amber bg-amber-100 border-amber-500 text-amber-950 ring-2 ring-amber-400 hover:bg-amber-200',
  CANCELLED:
    'bg-slate-100 border-slate-300 text-slate-500 line-through hover:bg-slate-200',
  COMPLETED:
    'bg-violet-100 border-violet-400 text-violet-950 hover:bg-violet-200',
};

const STATUS_TONE = {
  SCHEDULED: 'blue',
  CONFIRMED: 'green',
  AVAILABLE_FOR_REASSIGNMENT: 'amber',
  CANCELLED: 'red',
  COMPLETED: 'violet',
} as const;

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function StatusLegend() {
  const items: AppointmentStatus[] = [
    'SCHEDULED',
    'CONFIRMED',
    'AVAILABLE_FOR_REASSIGNMENT',
    'CANCELLED',
    'COMPLETED',
  ];
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
      {items.map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`inline-block h-3 w-3 rounded-sm border ${STATUS_BLOCK[status].split(' hover:')[0]}`}
          />
          {STATUS_LABEL[status]}
        </li>
      ))}
    </ul>
  );
}

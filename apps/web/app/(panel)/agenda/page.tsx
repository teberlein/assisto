'use client';

import { useMemo, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import {
  DAY_NAMES_SHORT,
  addDays,
  endOfDay,
  fmtLongDate,
  fmtTime,
  isSameDay,
  minutesOfDay,
  minutesToTime,
  startOfWeek,
  weekDays,
  weekLabel,
} from '@/lib/date';
import { useAsync } from '@/lib/useAsync';
import {
  Alert,
  Button,
  Card,
  ErrorState,
  LoadingState,
  cx,
} from '@/components/ui';
import { ConfirmDialog, Drawer } from '@/components/drawer';
import {
  ORIGIN_LABEL,
  STATUS_BLOCK,
  StatusBadge,
  StatusLegend,
} from '@/components/appointment';
import { PageHeader, ProfessionalGate } from '../professional-gate';
import type { Appointment, Professional } from '@/types/api';

/** Rango horario visible de la grilla. */
const DAY_START_MIN = 7 * 60;
const DAY_END_MIN = 22 * 60;
const TOTAL_MIN = DAY_END_MIN - DAY_START_MIN;
const HOURS = Array.from({ length: (TOTAL_MIN / 60) + 1 }, (_, i) => DAY_START_MIN + i * 60);

export default function AgendaPage() {
  return (
    <ProfessionalGate>
      {(professional) => <Agenda professional={professional} />}
    </ProfessionalGate>
  );
}

function Agenda({ professional }: { professional: Professional }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const from = weekStart.toISOString();
  const to = useMemo(
    () => endOfDay(addDays(weekStart, 6)).toISOString(),
    [weekStart],
  );

  const { data, loading, error, reload } = useAsync<Appointment[]>(
    () => api.listAppointments({ professionalId: professional.id, from, to }),
    [professional.id, from, to],
  );

  const appointments = data ?? [];
  const selected = appointments.find((a) => a.id === selectedId) ?? null;

  const liberados = appointments.filter(
    (a) => a.status === 'AVAILABLE_FOR_REASSIGNMENT',
  ).length;

  return (
    <>
      <PageHeader
        title="Agenda semanal"
        description={`Turnos de ${professional.displayName}. Hacé clic en un turno para ver el detalle.`}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWeekStart((w) => addDays(w, -7))}
            >
              <span aria-hidden="true">←</span> Semana anterior
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWeekStart(startOfWeek(new Date()))}
            >
              Hoy
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWeekStart((w) => addDays(w, 7))}
            >
              Semana siguiente <span aria-hidden="true">→</span>
            </Button>
          </div>
        }
      />

      {liberados > 0 && (
        <div className="mb-4">
          <Alert tone="warning" title="Cupos liberados en esta semana">
            Hay {liberados} {liberados === 1 ? 'turno' : 'turnos'} en estado
            &laquo;cupo liberado&raquo;: el motor de reasignación está buscando
            reemplazo entre los pacientes de la lista de espera.
          </Alert>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <p
            className="text-sm font-medium text-slate-800"
            aria-live="polite"
          >
            {weekLabel(weekStart)}
          </p>
          <StatusLegend />
        </div>

        {loading && <LoadingState label="Cargando la agenda…" />}
        {!loading && error && <ErrorState message={error} onRetry={reload} />}

        {!loading && !error && (
          <WeekGrid
            days={days}
            appointments={appointments}
            onSelect={setSelectedId}
          />
        )}
      </Card>

      <AppointmentDrawer
        appointment={selected}
        onClose={() => setSelectedId(null)}
        onChanged={() => {
          setSelectedId(null);
          reload();
        }}
      />
    </>
  );
}

/* ---------------------------------------------------------------- grilla */

function WeekGrid({
  days,
  appointments,
  onSelect,
}: {
  days: Date[];
  appointments: Appointment[];
  onSelect: (id: string) => void;
}) {
  const today = new Date();

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[46rem]">
        {/* encabezado de días */}
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-slate-200 bg-slate-50">
          <div aria-hidden="true" />
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={cx(
                'px-2 py-2 text-center text-xs font-medium',
                isSameDay(day, today)
                  ? 'bg-brand-50 text-brand-800'
                  : 'text-slate-600',
              )}
            >
              <div>{DAY_NAMES_SHORT[day.getDay()]}</div>
              <div className="text-sm font-semibold text-slate-900">
                {day.getDate()}
              </div>
            </div>
          ))}
        </div>

        {/* cuerpo */}
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
          {/* columna de horas */}
          <div className="relative" style={{ height: `${TOTAL_MIN}px` }}>
            {HOURS.map((minute) => (
              <div
                key={minute}
                className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-slate-500"
                style={{ top: `${minute - DAY_START_MIN}px` }}
              >
                {minutesToTime(minute)}
              </div>
            ))}
          </div>

          {days.map((day) => {
            const dayAppointments = appointments.filter((a) =>
              isSameDay(new Date(a.startAt), day),
            );
            return (
              <div
                key={day.toISOString()}
                className="relative border-l border-slate-200"
                style={{ height: `${TOTAL_MIN}px` }}
              >
                {HOURS.map((minute) => (
                  <div
                    key={minute}
                    aria-hidden="true"
                    className="absolute left-0 right-0 border-t border-slate-100"
                    style={{ top: `${minute - DAY_START_MIN}px` }}
                  />
                ))}

                {dayAppointments.map((appointment) => (
                  <AppointmentBlock
                    key={appointment.id}
                    appointment={appointment}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {appointments.length === 0 && (
          <p className="border-t border-slate-200 px-4 py-6 text-center text-sm text-slate-600">
            No hay turnos en esta semana.
          </p>
        )}
      </div>
    </div>
  );
}

function AppointmentBlock({
  appointment,
  onSelect,
}: {
  appointment: Appointment;
  onSelect: (id: string) => void;
}) {
  const start = new Date(appointment.startAt);
  const end = new Date(appointment.endAt);

  const startMin = Math.max(minutesOfDay(start), DAY_START_MIN);
  const rawEnd = minutesOfDay(end) || DAY_END_MIN;
  const endMin = Math.min(rawEnd <= startMin ? DAY_END_MIN : rawEnd, DAY_END_MIN);

  const top = startMin - DAY_START_MIN;
  const height = Math.max(endMin - startMin, 22);

  const title = appointment.patient?.fullName ?? 'Sin paciente asignado';

  return (
    <button
      type="button"
      onClick={() => onSelect(appointment.id)}
      style={{ top: `${top}px`, height: `${height}px` }}
      className={cx(
        'absolute left-0.5 right-0.5 overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight transition-colors',
        STATUS_BLOCK[appointment.status],
      )}
    >
      <span className="block font-semibold tabular-nums">
        {fmtTime(start)}
      </span>
      <span className="block truncate">{title}</span>
      {appointment.serviceType && height > 44 && (
        <span className="block truncate opacity-80">
          {appointment.serviceType.name}
        </span>
      )}
    </button>
  );
}

/* ---------------------------------------------------------- panel lateral */

function AppointmentDrawer({
  appointment,
  onClose,
  onChanged,
}: {
  appointment: Appointment | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!appointment) return null;

  const cancelable =
    appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED';

  async function confirmAttendance() {
    if (!appointment) return;
    setBusy('confirm');
    setError(null);
    try {
      await api.confirmAppointment(appointment.id);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!appointment) return;
    setBusy('cancel');
    setError(null);
    try {
      await api.cancelAppointmentAsProfessional(appointment.id);
      setConfirmCancel(false);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      setConfirmCancel(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title="Detalle del turno"
        footer={
          <div className="flex flex-col gap-2">
            {appointment.status === 'SCHEDULED' && (
              <Button
                fullWidth
                loading={busy === 'confirm'}
                onClick={confirmAttendance}
              >
                Confirmar asistencia
              </Button>
            )}
            {cancelable && (
              <Button
                variant="danger"
                fullWidth
                disabled={busy !== null}
                onClick={() => setConfirmCancel(true)}
              >
                Cancelar turno
              </Button>
            )}
            {!cancelable && appointment.status !== 'SCHEDULED' && (
              <p className="text-xs text-slate-500">
                Este turno no admite más acciones desde el panel.
              </p>
            )}
          </div>
        }
      >
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Estado
            </dt>
            <dd className="mt-1">
              <StatusBadge status={appointment.status} />
            </dd>
          </div>

          {appointment.status === 'AVAILABLE_FOR_REASSIGNMENT' && (
            <Alert tone="warning" title="Cupo liberado">
              El motor de reasignación está avisando a los pacientes de la lista
              de espera. Gana el primero que confirme.
            </Alert>
          )}

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Cuándo
            </dt>
            <dd className="mt-1 text-slate-900">
              {fmtLongDate(appointment.startAt)}
              <br />
              {fmtTime(appointment.startAt)} – {fmtTime(appointment.endAt)}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Paciente
            </dt>
            <dd className="mt-1 text-slate-900">
              {appointment.patient ? (
                <>
                  {appointment.patient.fullName}
                  <br />
                  <a
                    href={`tel:${appointment.patient.phone}`}
                    className="text-brand-700 underline underline-offset-4"
                  >
                    {appointment.patient.phone}
                  </a>
                </>
              ) : (
                <span className="text-slate-500">Sin paciente asignado</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Servicio
            </dt>
            <dd className="mt-1 text-slate-900">
              {appointment.serviceType?.name ?? 'Sin especificar'}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Origen
            </dt>
            <dd className="mt-1 text-slate-900">
              {ORIGIN_LABEL[appointment.origin]}
            </dd>
          </div>

          {error && <Alert tone="error">{error}</Alert>}
        </dl>
      </Drawer>

      <ConfirmDialog
        open={confirmCancel}
        title="¿Cancelar este turno?"
        description={
          <>
            <p>
              El turno de{' '}
              <strong>
                {appointment.patient?.fullName ?? 'este paciente'}
              </strong>{' '}
              del {fmtLongDate(appointment.startAt)} a las{' '}
              {fmtTime(appointment.startAt)} se va a liberar.
            </p>
            <p className="mt-2">
              Esto <strong>dispara el motor de reasignación</strong>: vamos a
              empezar a avisarle a los pacientes de la lista de espera para
              ocupar el cupo. La acción no se puede deshacer.
            </p>
          </>
        }
        confirmLabel="Sí, cancelar y liberar"
        cancelLabel="No, volver"
        loading={busy === 'cancel'}
        onConfirm={cancel}
        onCancel={() => setConfirmCancel(false)}
      />
    </>
  );
}

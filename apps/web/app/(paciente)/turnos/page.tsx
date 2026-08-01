'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { api, errorMessage } from '@/lib/api';
import { useRequirePatient } from '@/lib/auth';
import { fmtDateTime, isPast, relativeTime } from '@/lib/date';
import { useAsync } from '@/lib/useAsync';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/ui';
import { ConfirmDialog, Drawer } from '@/components/drawer';
import { DaysOfWeekPicker } from '@/components/day-picker';
import { StatusBadge } from '@/components/appointment';
import type { Appointment } from '@/types/api';

export default function MisTurnosPage() {
  const { session, ready } = useRequirePatient();

  const { data, loading, error, reload } = useAsync<Appointment[]>(
    () => api.myAppointments(),
    [session?.patient.id],
    Boolean(session),
  );

  const { proximos, pasados } = useMemo(() => {
    const all = data ?? [];
    const byStart = (a: Appointment, b: Appointment) =>
      new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    return {
      proximos: all
        .filter((a) => !isPast(a.startAt) && a.status !== 'CANCELLED')
        .sort(byStart),
      pasados: all
        .filter((a) => isPast(a.startAt) || a.status === 'CANCELLED')
        .sort((a, b) => byStart(b, a)),
    };
  }, [data]);

  if (!ready || !session) return <LoadingState />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Mis turnos</h1>
        <p className="mt-1 text-sm text-slate-600">
          Acá ves todo lo que tenés agendado, sacado por web o por WhatsApp.
        </p>
      </div>

      {loading && (
        <Card>
          <LoadingState label="Cargando tus turnos…" />
        </Card>
      )}
      {!loading && error && (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      )}

      {!loading && !error && (
        <>
          <Card>
            <CardHeader title="Próximos" />
            {proximos.length === 0 ? (
              <EmptyState
                title="No tenés turnos próximos"
                description="Sacá uno en dos toques."
                action={
                  <Link
                    href="/reservar"
                    className="inline-flex items-center rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
                  >
                    Reservar un turno
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-slate-200">
                {proximos.map((appointment) => (
                  <UpcomingRow
                    key={appointment.id}
                    appointment={appointment}
                    onChanged={reload}
                  />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Pasados y cancelados" />
            {pasados.length === 0 ? (
              <EmptyState title="Todavía no hay historial" />
            ) : (
              <ul className="divide-y divide-slate-200">
                {pasados.map((appointment) => (
                  <li key={appointment.id} className="px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-slate-700">
                        {fmtDateTime(appointment.startAt)}
                      </p>
                      <StatusBadge status={appointment.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {appointment.professional?.displayName ?? 'Profesional'}
                      {appointment.serviceType
                        ? ` · ${appointment.serviceType.name}`
                        : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function UpcomingRow({
  appointment,
  onChanged,
}: {
  appointment: Appointment;
  onChanged: () => void;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [earlierOpen, setEarlierOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await api.cancelMyAppointment(appointment.id);
      setConfirmCancel(false);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      setConfirmCancel(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {fmtDateTime(appointment.startAt)}
          </p>
          <p className="text-sm text-slate-600">
            {appointment.professional?.displayName ?? 'Profesional'}
            {appointment.serviceType ? ` · ${appointment.serviceType.name}` : ''}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {relativeTime(appointment.startAt)}
          </p>
        </div>
        <StatusBadge status={appointment.status} />
      </div>

      {notice && (
        <div className="mt-3">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          variant="secondary"
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => setEarlierOpen(true)}
        >
          Avisame si se libera un turno antes
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full sm:w-auto"
          disabled={busy}
          onClick={() => setConfirmCancel(true)}
        >
          Cancelar turno
        </Button>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="¿Cancelar este turno?"
        description={
          <>
            <p>
              Vas a cancelar el turno del {fmtDateTime(appointment.startAt)}.
            </p>
            <p className="mt-2">
              El cupo se libera y se lo ofrecemos a otros pacientes. Si después
              querés volver, tenés que sacar turno de nuevo.
            </p>
          </>
        }
        confirmLabel="Sí, cancelar"
        loading={busy}
        onConfirm={cancel}
        onCancel={() => setConfirmCancel(false)}
      />

      <EarlierSlotDrawer
        open={earlierOpen}
        appointment={appointment}
        onClose={() => setEarlierOpen(false)}
        onDone={(message) => {
          setEarlierOpen(false);
          setNotice(message);
        }}
      />
    </li>
  );
}

/** Alta de WaitlistEntry con `linkedAppointmentId` (spec 6.2). */
function EarlierSlotDrawer({
  open,
  appointment,
  onClose,
  onDone,
}: {
  open: boolean;
  appointment: Appointment;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [days, setDays] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.joinWaitlist({
        professionalId: appointment.professionalId,
        ...(appointment.serviceTypeId
          ? { serviceTypeId: appointment.serviceTypeId }
          : {}),
        ...(days.length > 0 ? { preferredDaysOfWeek: days } : {}),
        linkedAppointmentId: appointment.id,
      });
      onDone(
        'Listo. Te vamos a avisar si se libera un turno antes. Tu turno actual sigue en pie hasta que tomes otro.',
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Avisame si se libera antes"
      footer={
        <Button fullWidth loading={busy} onClick={submit}>
          Anotarme
        </Button>
      }
    >
      <div className="space-y-4 text-sm text-slate-700">
        <p>
          Te anotamos en la lista de espera de{' '}
          <strong>
            {appointment.professional?.displayName ?? 'tu profesional'}
          </strong>{' '}
          para el turno del {fmtDateTime(appointment.startAt)}.
        </p>

        <Alert tone="info">
          Si tomás un turno más temprano, tu turno actual se cancela solo y ese
          cupo queda disponible para otra persona.
        </Alert>

        <DaysOfWeekPicker
          legend="¿Qué días te vendrían bien?"
          hint="Opcional. Si no elegís ninguno, te avisamos por cualquier día."
          value={days}
          onChange={setDays}
        />

        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Drawer>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, errorMessage } from '@/lib/api';
import { useRequirePatient } from '@/lib/auth';
import { DAY_NAMES, DAY_NAMES_SHORT, fmtDateTime } from '@/lib/date';
import { useAsync } from '@/lib/useAsync';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/drawer';
import type { WaitlistEntry } from '@/types/api';

/**
 * Lista de espera del paciente (sec 6.2). Muestra las anotaciones activas y
 * permite salirse de cualquiera. El alta se hace desde "Reservar" o desde el
 * botón "avisame si se libera antes" de cada turno.
 */
export default function ListaDeEsperaPage() {
  const { session, ready } = useRequirePatient();

  const { data, loading, error, reload } = useAsync<WaitlistEntry[]>(
    () => api.myWaitlist(),
    [session?.patient.id],
    Boolean(session),
  );

  if (!ready || !session) return <LoadingState />;

  const activas = (data ?? []).filter((entry) => entry.status === 'ACTIVE');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Lista de espera
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Estás anotado para que te avisemos apenas se libere un turno que te
          sirva. Podés salirte cuando quieras.
        </p>
      </div>

      {loading && (
        <Card>
          <LoadingState label="Cargando tus anotaciones…" />
        </Card>
      )}
      {!loading && error && (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      )}

      {!loading && !error && (
        <Card>
          <CardHeader title="Anotaciones activas" />
          {activas.length === 0 ? (
            <EmptyState
              title="No estás en ninguna lista de espera"
              description="Cuando saques un turno vas a poder pedir que te avisemos si se libera uno antes."
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
              {activas.map((entry) => (
                <EntryRow key={entry.id} entry={entry} onChanged={reload} />
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function EntryRow({
  entry,
  onChanged,
}: {
  entry: WaitlistEntry;
  onChanged: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = (entry.preferredDaysOfWeek ?? [])
    .slice()
    .sort((a, b) => a - b);

  async function leave() {
    setBusy(true);
    setError(null);
    try {
      await api.leaveWaitlist(entry.id);
      setConfirm(false);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {entry.professional?.displayName ?? 'Profesional'}
            {entry.serviceType ? ` · ${entry.serviceType.name}` : ''}
          </p>

          {entry.linkedAppointment ? (
            <p className="mt-0.5 text-sm text-slate-600">
              Para adelantar tu turno del{' '}
              {fmtDateTime(entry.linkedAppointment.startAt)}.
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-slate-600">
              Esperando un primer turno disponible.
            </p>
          )}

          {days.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {days.map((day) => (
                <Badge key={day} tone="brand">
                  <span className="sr-only">{DAY_NAMES[day]}</span>
                  <span aria-hidden="true">{DAY_NAMES_SHORT[day]}</span>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
          Salir de la lista
        </Button>
      </div>

      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        title="¿Salir de la lista de espera?"
        description={
          <p>
            Dejamos de avisarte si se libera un turno de{' '}
            {entry.professional?.displayName ?? 'este profesional'}.
            {entry.linkedAppointment
              ? ' Tu turno actual no se toca.'
              : ''}
          </p>
        }
        confirmLabel="Sí, salir"
        loading={busy}
        onConfirm={leave}
        onCancel={() => setConfirm(false)}
      />
    </li>
  );
}

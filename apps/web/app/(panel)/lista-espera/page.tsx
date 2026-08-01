'use client';

import { useMemo } from 'react';
import { api } from '@/lib/api';
import { DAY_NAMES_SHORT, fmtDateTime, relativeTime } from '@/lib/date';
import { useAsync } from '@/lib/useAsync';
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/ui';
import { PageHeader, ProfessionalGate } from '../professional-gate';
import type { Professional, WaitlistEntry } from '@/types/api';

export default function ListaEsperaPage() {
  return (
    <ProfessionalGate>
      {(professional) => <ListaEspera professional={professional} />}
    </ProfessionalGate>
  );
}

function ListaEspera({ professional }: { professional: Professional }) {
  const { data, loading, error, reload } = useAsync<WaitlistEntry[]>(
    () => api.listWaitlist(professional.id),
    [professional.id],
  );

  const { sinTurno, quierenAdelantar } = useMemo(() => {
    const active = (data ?? []).filter(
      (entry) => !entry.status || entry.status === 'ACTIVE',
    );
    const byCreatedAt = (a: WaitlistEntry, b: WaitlistEntry) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

    return {
      sinTurno: active.filter((e) => !e.linkedAppointmentId).sort(byCreatedAt),
      quierenAdelantar: active
        .filter((e) => !!e.linkedAppointmentId)
        .sort(byCreatedAt),
    };
  }, [data]);

  return (
    <>
      <PageHeader
        title="Lista de espera"
        description={`Orden en que el motor va a notificar a los pacientes de ${professional.displayName} cuando se libere un cupo.`}
      />

      <Alert tone="info" title="Cómo funciona la prioridad">
        Primero se avisa a quienes <strong>no tienen turno agendado</strong>;
        después a quienes ya tienen uno y pidieron adelantarlo. Dentro de cada
        grupo el orden es por antigüedad de inscripción (FIFO). Ser el primero
        de la lista no reserva el cupo: sólo significa que se te avisa antes.
      </Alert>

      {loading && (
        <Card className="mt-4">
          <LoadingState label="Cargando lista de espera…" />
        </Card>
      )}
      {!loading && error && (
        <Card className="mt-4">
          <ErrorState message={error} onRetry={reload} />
        </Card>
      )}

      {!loading && !error && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Group
            title="1. Sin turno agendado"
            description="Grupo prioritario: se los notifica primero."
            tone="brand"
            entries={sinTurno}
          />
          <Group
            title="2. Quieren adelantar su turno"
            description="Ya tienen turno y pidieron que les avisemos si se libera uno antes."
            tone="violet"
            entries={quierenAdelantar}
          />
        </div>
      )}
    </>
  );
}

function Group({
  title,
  description,
  tone,
  entries,
}: {
  title: string;
  description: string;
  tone: 'brand' | 'violet';
  entries: WaitlistEntry[];
}) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {title}
            <Badge tone={tone}>{entries.length}</Badge>
          </span>
        }
        description={description}
      />

      {entries.length === 0 ? (
        <EmptyState title="No hay nadie anotado en este grupo" />
      ) : (
        <ol className="divide-y divide-slate-200">
          {entries.map((entry, index) => (
            <li key={entry.id} className="flex gap-3 px-4 py-3 sm:px-5">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">
                  <span className="sr-only">Posición {index + 1}: </span>
                  {entry.patient?.fullName ?? 'Paciente'}
                </p>
                {entry.patient?.phone && (
                  <p className="text-sm text-slate-600">{entry.patient.phone}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Anotado {relativeTime(entry.createdAt)}
                  {entry.serviceType ? ` · ${entry.serviceType.name}` : ''}
                </p>
                {entry.preferredDaysOfWeek &&
                  entry.preferredDaysOfWeek.length > 0 && (
                    <p className="mt-1 text-xs text-slate-600">
                      Prefiere:{' '}
                      {entry.preferredDaysOfWeek
                        .map((d) => DAY_NAMES_SHORT[d])
                        .join(', ')}
                    </p>
                  )}
                {entry.linkedAppointment && (
                  <p className="mt-1 text-xs text-slate-600">
                    Turno actual: {fmtDateTime(entry.linkedAppointment.startAt)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

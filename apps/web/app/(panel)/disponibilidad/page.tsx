'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { DAY_NAMES, fmtShortDate, fromISODate, timeToMinutes, toISODate } from '@/lib/date';
import { useAsync } from '@/lib/useAsync';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Select,
  Tabs,
} from '@/components/ui';
import { PageHeader, ProfessionalGate } from '../professional-gate';
import type { AvailabilitySlot, Professional } from '@/types/api';

type Mode = 'recurrente' | 'puntual';

export default function DisponibilidadPage() {
  return (
    <ProfessionalGate>
      {(professional) => <Disponibilidad professional={professional} />}
    </ProfessionalGate>
  );
}

function Disponibilidad({ professional }: { professional: Professional }) {
  const [mode, setMode] = useState<Mode>('recurrente');
  const { data, loading, error, reload } = useAsync<AvailabilitySlot[]>(
    () => api.listAvailability(professional.id),
    [professional.id],
  );

  const slots = data ?? [];
  const recurrentes = slots
    .filter((s) => s.dayOfWeek !== null && s.dayOfWeek !== undefined)
    .sort(
      (a, b) =>
        (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0) ||
        timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
    );
  const puntuales = slots
    .filter((s) => !!s.specificDate)
    .sort(
      (a, b) =>
        (a.specificDate ?? '').localeCompare(b.specificDate ?? '') ||
        timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
    );

  const visibles = mode === 'recurrente' ? recurrentes : puntuales;

  return (
    <>
      <PageHeader
        title="Disponibilidad"
        description="Las franjas que cargues acá son la base para calcular los horarios que ven los pacientes."
      />

      <div className="mb-4">
        <Tabs
          label="Tipo de disponibilidad"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'recurrente', label: 'Recurrente' },
            { value: 'puntual', label: 'Puntual' },
          ]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <NewSlotForm
          mode={mode}
          professionalId={professional.id}
          onCreated={reload}
        />

        <Card>
          <CardHeader
            title={
              mode === 'recurrente'
                ? 'Franjas recurrentes'
                : 'Franjas de fechas puntuales'
            }
            description={
              mode === 'recurrente'
                ? 'Se repiten todas las semanas.'
                : 'Valen sólo para la fecha indicada.'
            }
          />

          {loading && <LoadingState label="Cargando disponibilidad…" />}
          {!loading && error && <ErrorState message={error} onRetry={reload} />}

          {!loading && !error && visibles.length === 0 && (
            <EmptyState
              title={
                mode === 'recurrente'
                  ? 'Todavía no cargaste franjas semanales'
                  : 'No hay franjas para fechas puntuales'
              }
              description="Usá el formulario de la izquierda para agregar la primera."
            />
          )}

          {!loading && !error && visibles.length > 0 && (
            <ul className="divide-y divide-slate-200">
              {visibles.map((slot) => (
                <SlotRow
                  key={slot.id}
                  slot={slot}
                  professionalId={professional.id}
                  onDeleted={reload}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function SlotRow({
  slot,
  professionalId,
  onDeleted,
}: {
  slot: AvailabilitySlot;
  professionalId: string;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label =
    slot.dayOfWeek !== null && slot.dayOfWeek !== undefined
      ? DAY_NAMES[slot.dayOfWeek]
      : slot.specificDate
        ? fmtShortDate(fromISODate(slot.specificDate))
        : '—';

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAvailability(professionalId, slot.id);
      onDeleted();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-sm tabular-nums text-slate-600">
          {slot.startTime} – {slot.endTime}
        </p>
        {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      </div>
      <Button variant="secondary" size="sm" loading={busy} onClick={remove}>
        Borrar
      </Button>
    </li>
  );
}

function NewSlotForm({
  mode,
  professionalId,
  onCreated,
}: {
  mode: Mode;
  professionalId: string;
  onCreated: () => void;
}) {
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [specificDate, setSpecificDate] = useState(() => toISODate(new Date()));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('13:00');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setOk(false);

    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      setError('La hora de fin tiene que ser posterior a la de inicio.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.createAvailability(professionalId, {
        ...(mode === 'recurrente'
          ? { dayOfWeek: Number(dayOfWeek) }
          : { specificDate }),
        startTime,
        endTime,
      });
      setOk(true);
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader
        title={
          mode === 'recurrente' ? 'Nueva franja semanal' : 'Nueva franja puntual'
        }
      />
      <form onSubmit={onSubmit} className="space-y-4 px-4 py-4 sm:px-5" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        {ok && <Alert tone="success">Franja agregada.</Alert>}

        {mode === 'recurrente' ? (
          <Field label="Día de la semana" required>
            {({ id }) => (
              <Select
                id={id}
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value)}
              >
                {DAY_NAMES.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <Field label="Fecha" required>
            {({ id }) => (
              <Input
                id={id}
                type="date"
                required
                value={specificDate}
                onChange={(e) => setSpecificDate(e.target.value)}
              />
            )}
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde" required>
            {({ id }) => (
              <Input
                id={id}
                type="time"
                required
                step={300}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            )}
          </Field>
          <Field label="Hasta" required>
            {({ id }) => (
              <Input
                id={id}
                type="time"
                required
                step={300}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            )}
          </Field>
        </div>

        <Button type="submit" fullWidth loading={submitting}>
          Agregar franja
        </Button>
      </form>
    </Card>
  );
}
